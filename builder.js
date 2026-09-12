const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { validateProject, prepareProject } = require('./projectPrep');
const { applyIdentity } = require('./identity');

const ANDROID_SDK_ROOT = process.env.ANDROID_SDK_ROOT || '/opt/android-sdk';
const JAVA_HOME = process.env.JAVA_HOME || '/usr/lib/jvm/java-17-openjdk-amd64';
const BUILD_TIMEOUT_MS = Number(process.env.BUILD_TIMEOUT_MS || 20 * 60 * 1000);
const MAX_CONCURRENT_BUILDS = Number(process.env.MAX_CONCURRENT_BUILDS || 2);
const MAX_ARCHIVE_ENTRIES = Number(process.env.MAX_ARCHIVE_ENTRIES || 30000);
const MIRROR_INIT_SCRIPT = path.join(__dirname, 'mirror.init.gradle');
const builds = new Map();
const queue = [];
let running = 0;
let persistFile = null;

function persist() {
  if (!persistFile) return;
  const data = [...builds.values()].map(publicView);
  fs.writeFile(persistFile, JSON.stringify(data), () => {});
}

function loadPersisted(file) {
  persistFile = file;
  if (!fs.existsSync(file)) return;
  try {
    for (const b of JSON.parse(fs.readFileSync(file, 'utf8'))) {
      builds.set(b.id, {
        ...b,
        status: b.status === 'success' || b.status === 'failed' ? b.status : 'failed',
        error: b.status === 'success' || b.status === 'failed' ? b.error : 'Server restarted during the build.',
        log: b.log || [],
        listeners: new Set(),
        apks: (b.apks || []).filter((a) => a.path && fs.existsSync(a.path)),
      });
    }
  } catch (err) {
    console.error('Could not load build history:', err.message);
  }
}

function publicView(b) {
  return {
    id: b.id,
    name: b.name,
    status: b.status,
    createdAt: b.createdAt,
    finishedAt: b.finishedAt,
    durationSeconds: b.durationSeconds,
    variant: b.variant,
    identity: b.identity,
    fixes: b.fixes,
    warnings: b.warnings,
    error: b.error,
    apks: b.apks.map(({ file, size, path: p }) => ({ file, size, path: p })),
    log: b.log.slice(-200),
  };
}

function getBuild(id) {
  return builds.get(id);
}

function listBuilds() {
  return [...builds.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((b) => {
      const { log, ...rest } = publicView(b);
      return { ...rest, apks: rest.apks.map(({ file, size }) => ({ file, size })) };
    });
}

function emit(build, line) {
  build.log.push(line);
  if (build.log.length > 5000) build.log.shift();
  for (const listener of build.listeners) listener(line);
}

function setStatus(build, status) {
  build.status = status;
  emit(build, `__status__:${status}`);
  persist();
}

function run(build, cmd, args, cwd) {
  return new Promise((resolve) => {
    emit(build, `$ ${cmd} ${args.filter((a) => !a.includes('mirror.init.gradle')).join(' ')}`);
    const child = spawn(cmd, args, {
      cwd,
      env: {
        ...process.env,
        ANDROID_SDK_ROOT,
        ANDROID_HOME: ANDROID_SDK_ROOT,
        JAVA_HOME,
        PATH: `${JAVA_HOME}/bin:${process.env.PATH}`,
        GRADLE_USER_HOME: process.env.GRADLE_USER_HOME || path.join(process.env.HOME || '/tmp', '.gradle'),
      },
    });
    const timer = setTimeout(() => {
      emit(build, `Build timed out after ${BUILD_TIMEOUT_MS / 1000}s — killing Gradle.`);
      child.kill('SIGKILL');
    }, BUILD_TIMEOUT_MS);
    const onData = (chunk) => {
      for (const line of chunk.toString().split('\n')) if (line.trim()) emit(build, line);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (err) => {
      clearTimeout(timer);
      emit(build, `Failed to start ${cmd}: ${err.message}`);
      resolve(1);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === null ? 1 : code);
    });
  });
}

function safeExtract(zipPath, dest) {
  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error(`Zip has too many entries (${entries.length}).`);
  for (const e of entries) {
    const name = e.entryName.replace(/\\/g, '/');
    if (name.startsWith('/') || name.split('/').includes('..')) throw new Error(`Unsafe path in zip: ${e.entryName}`);
  }
  zip.extractAllTo(dest, true);
  return entries.length;
}

function collectApks(root) {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 8) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.name.endsWith('.apk')) found.push(full);
    }
  };
  walk(root, 0);
  return found.filter((p) => p.includes(`${path.sep}build${path.sep}outputs${path.sep}`));
}

function slug(value) {
  return (value || 'app').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
}

async function execute(build) {
  const startedAt = Date.now();
  const { zipPath, workDir, identity, variant } = build.internal;
  const extractDir = path.join(workDir, 'src');
  fs.mkdirSync(extractDir, { recursive: true });
  const log = (line) => emit(build, line);
  try {
    setStatus(build, 'extracting');
    const count = safeExtract(zipPath, extractDir);
    log(`Extracted ${count} entries from ${build.name}.`);

    setStatus(build, 'validating');
    const validation = validateProject(extractDir);
    build.warnings = validation.warnings;
    validation.warnings.forEach((w) => log(`warning: ${w}`));
    if (!validation.ok) {
      validation.errors.forEach((e) => log(`error: ${e}`));
      throw new Error(validation.errors.join(' '));
    }
    log(`Project root: ${path.relative(extractDir, validation.root) || '.'}`);
    log(`Modules: ${validation.modules.join(', ') || '(none detected)'}`);

    setStatus(build, 'preparing');
    const { fixes, useWrapper } = prepareProject(validation.root, {
      sdkDir: ANDROID_SDK_ROOT,
      appModule: validation.appModule,
      modules: validation.modules,
    });
    build.fixes = fixes;
    fixes.forEach((f) => log(`fix: ${f}`));

    const moduleDir = path.join(validation.root, validation.appModule || validation.modules[0] || '.');
    await applyIdentity(moduleDir, identity, log);

    setStatus(build, 'building');
    const task = validation.appModule
      ? `:${validation.appModule}:assemble${variant === 'release' ? 'Release' : 'Debug'}`
      : `assemble${variant === 'release' ? 'Release' : 'Debug'}`;
    const code = await run(
      build,
      useWrapper ? './gradlew' : 'gradle',
        [
        task,
        '--no-daemon',
        '--max-workers=1',
        '-Dorg.gradle.jvmargs=-Xmx384m -XX:+UseSerialGC',
        '--init-script',
        MIRROR_INIT_SCRIPT,
        '-Dorg.gradle.internal.repository.max.retries=10',
        '-Dorg.gradle.internal.repository.initial.backoff=3000',
      ],
            validation.root
    );
    if (code !== 0) throw new Error(`Gradle exited with code ${code}. Check the log above for "What went wrong".`);

    const apks = collectApks(validation.root);
    if (apks.length === 0) throw new Error('Build succeeded but no APK was produced under build/outputs.');
    const outDir = path.join(workDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const base = `${slug(identity.appName)}${identity.versionName ? `-v${slug(identity.versionName)}` : ''}-${variant}`;
    build.apks = apks.map((apk, i) => {
      const suffix = apks.length > 1 ? `-${i + 1}` : '';
      const file = `${base}${suffix}.apk`;
      const dest = path.join(outDir, file);
      fs.copyFileSync(apk, dest);
      return { file, size: fs.statSync(dest).size, path: dest };
    });
    log(`Produced ${build.apks.length} APK(s): ${build.apks.map((a) => a.file).join(', ')}`);
    finish(build, 'success', startedAt);
  } catch (err) {
    build.error = err.message;
    log(`error: ${err.message}`);
    finish(build, 'failed', startedAt);
  } finally {
    fs.rm(zipPath, { force: true }, () => {});
    if (identity.iconPath) fs.rm(identity.iconPath, { force: true }, () => {});
    fs.rm(extractDir, { recursive: true, force: true }, () => {});
  }
}

function finish(build, status, startedAt) {
  build.finishedAt = new Date().toISOString();
  build.durationSeconds = Math.round((Date.now() - startedAt) / 1000);
  setStatus(build, status);
  running -= 1;
  pump();
}

function pump() {
  while (running < MAX_CONCURRENT_BUILDS && queue.length) {
    const build = queue.shift();
    running += 1;
    execute(build);
  }
}

function startBuild({ id, zipPath, iconPath, name, workRoot, variant = 'debug', identity }) {
  const workDir = path.join(workRoot, id);
  fs.mkdirSync(workDir, { recursive: true });
  const build = {
    id,
    name,
    status: 'queued',
    createdAt: new Date().toISOString(),
    finishedAt: null,
    durationSeconds: null,
    variant,
    identity: {
      appName: identity.appName || null,
      packageName: identity.packageName || null,
      versionName: identity.versionName || null,
      versionCode: identity.versionCode || null,
      permissions: identity.permissions.map((p) => p.key),
      hasIcon: Boolean(iconPath),
    },
    log: [],
    listeners: new Set(),
    apks: [],
    fixes: [],
    warnings: [],
    error: null,
    internal: { zipPath, workDir, variant, identity: { ...identity, iconPath } },
  };
  builds.set(id, build);
  emit(build, `Queued ${name}${queue.length ? ` (${queue.length} build(s) ahead)` : ''}.`);
  queue.push(build);
  pump();
  return build;
}

module.exports = { startBuild, getBuild, listBuilds, loadPersisted, publicView, ANDROID_SDK_ROOT };
