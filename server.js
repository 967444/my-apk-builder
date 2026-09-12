const express = require('express');
const multer = require('multer');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { startBuild, getBuild, listBuilds, loadPersisted, publicView, ANDROID_SDK_ROOT } = require('./builder');
const { PERMISSIONS, resolvePermissions } = require('./permissions');

const PORT = Number(process.env.PORT || 3000);
const WORK_ROOT = process.env.WORK_ROOT || path.join(os.tmpdir(), 'apk-builder');
const MAX_ZIP_MB = Number(process.env.MAX_ZIP_MB || 500);
const MAX_ICON_MB = Number(process.env.MAX_ICON_MB || 10);

fs.mkdirSync(path.join(WORK_ROOT, 'uploads'), { recursive: true });
loadPersisted(path.join(WORK_ROOT, 'builds.json'));

const upload = multer({
  dest: path.join(WORK_ROOT, 'uploads'),
  limits: { fileSize: MAX_ZIP_MB * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'project') {
      if (!/\.zip$/i.test(file.originalname)) return cb(new Error('Project must be a .zip file'));
      return cb(null, true);
    }
    if (file.fieldname === 'icon') {
      if (!/^image\/(png|jpe?g|webp)$/i.test(file.mimetype)) return cb(new Error('Icon must be PNG, JPEG or WebP'));
      return cb(null, true);
    }
    cb(new Error(`Unexpected field ${file.fieldname}`));
  },
});

const app = express();
app.use(express.json());
app.use(express.static(__dirname));
function versionOf(cmd, args) {
  const out = spawnSync(cmd, args, { encoding: 'utf8', timeout: 15000 });
  if (out.error) return null;
  return `${out.stdout || ''}\n${out.stderr || ''}`
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /\d+\.\d+/.test(l)) || null;
}

let toolchainCache = null;
app.get('/api/health', (req, res) => {
  if (!toolchainCache || Date.now() - toolchainCache.at > 60_000) {
    const list = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);
    toolchainCache = {
      at: Date.now(),
      data: {
        ok: true,
        sdk: ANDROID_SDK_ROOT,
        sdkInstalled: fs.existsSync(ANDROID_SDK_ROOT),
        buildTools: list(path.join(ANDROID_SDK_ROOT, 'build-tools')),
        platforms: list(path.join(ANDROID_SDK_ROOT, 'platforms')),
        java: versionOf('java', ['-version']),
        gradle: versionOf('gradle', ['--version']),
        maxZipMb: MAX_ZIP_MB,
      },
    };
  }
  res.json(toolchainCache.data);
});

app.get('/api/permissions', (req, res) => {
  res.json(PERMISSIONS.map(({ key, name, label, detail, group, dangerous }) => ({ key, name, label, detail, group, dangerous })));
});

const PACKAGE_RE = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

app.post('/api/builds', upload.fields([{ name: 'project', maxCount: 1 }, { name: 'icon', maxCount: 1 }]), (req, res) => {
  const project = req.files?.project?.[0];
  const icon = req.files?.icon?.[0];
  const cleanup = () => {
    if (project) fs.rm(project.path, { force: true }, () => {});
    if (icon) fs.rm(icon.path, { force: true }, () => {});
  };
  const fail = (msg) => {
    cleanup();
    res.status(400).json({ error: msg });
  };

  if (!project) return fail('No project zip uploaded (field name: project).');
  if (icon && icon.size > MAX_ICON_MB * 1024 * 1024) return fail(`Icon must be under ${MAX_ICON_MB} MB.`);

  const appName = String(req.body.appName || '').trim();
  if (!appName) return fail('App name is required.');
  if (appName.length > 60) return fail('App name must be 60 characters or fewer.');

  const packageName = String(req.body.packageName || '').trim();
  if (packageName && !PACKAGE_RE.test(packageName)) return fail('Package name must look like com.example.app.');

  const versionName = String(req.body.versionName || '').trim();
  if (versionName && !/^[\w.+-]{1,40}$/.test(versionName)) return fail('Version name contains invalid characters.');

  const versionCodeRaw = String(req.body.versionCode || '').trim();
  const versionCode = versionCodeRaw ? Number(versionCodeRaw) : null;
  if (versionCodeRaw && (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2100000000)) {
    return fail('Version code must be a positive whole number.');
  }

  let permissionKeys = [];
  try {
    const raw = req.body.permissions;
    permissionKeys = Array.isArray(raw) ? raw : raw ? JSON.parse(raw) : [];
  } catch {
    return fail('permissions must be a JSON array of permission keys.');
  }
  const { accepted, rejected } = resolvePermissions(permissionKeys);
  if (rejected.length) return fail(`Unknown permission(s): ${rejected.join(', ')}`);

  const variant = req.body.variant === 'release' ? 'release' : 'debug';
  const id = crypto.randomUUID();
  startBuild({
    id,
    zipPath: project.path,
    iconPath: icon ? icon.path : null,
    name: project.originalname,
    workRoot: WORK_ROOT,
    variant,
    identity: { appName, packageName, versionName, versionCode, permissions: accepted },
  });
  res.status(202).json({ id });
});

app.get('/api/builds', (req, res) => res.json(listBuilds()));

app.get('/api/builds/:id', (req, res) => {
  const build = getBuild(req.params.id);
  if (!build) return res.status(404).json({ error: 'Build not found' });
  const view = publicView(build);
  res.json({ ...view, apks: view.apks.map(({ file, size }) => ({ file, size })) });
});

app.get('/api/builds/:id/logs', (req, res) => {
  const build = getBuild(req.params.id);
  if (!build) return res.status(404).json({ error: 'Build not found' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (line) => res.write(`data: ${JSON.stringify(line)}\n\n`);
  build.log.forEach(send);
  if (build.status === 'success' || build.status === 'failed') {
    send(`__status__:${build.status}`);
    return res.end();
  }
  build.listeners.add(send);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 15000);
  req.on('close', () => {
    clearInterval(keepAlive);
    build.listeners.delete(send);
  });
});

app.get('/api/builds/:id/apk', (req, res) => {
  const build = getBuild(req.params.id);
  if (!build || build.apks.length === 0) return res.status(404).json({ error: 'No APK available' });
  const wanted = req.query.file ? build.apks.find((a) => a.file === req.query.file) : build.apks[0];
  if (!wanted || !fs.existsSync(wanted.path)) return res.status(404).json({ error: 'APK not found' });
  res.download(wanted.path, wanted.file);
});

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', () => console.log(`APK builder listening on http://0.0.0.0:${PORT}`));
