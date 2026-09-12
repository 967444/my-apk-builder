const fs = require('fs');
const path = require('path');

const GRADLE_FILES = ['settings.gradle', 'settings.gradle.kts', 'build.gradle', 'build.gradle.kts'];

function listDirs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

function hasAnyFile(dir, names) {
  return names.some((n) => fs.existsSync(path.join(dir, n)));
}

// A zip often wraps the project in a single top-level folder (and sometimes __MACOSX).
function findProjectRoot(dir, depth = 0) {
  if (hasAnyFile(dir, GRADLE_FILES)) return dir;
  if (depth >= 3) return null;
  for (const name of listDirs(dir)) {
    if (name === '__MACOSX' || name === '.git') continue;
    const found = findProjectRoot(path.join(dir, name), depth + 1);
    if (found) return found;
  }
  return null;
}

function findManifests(root) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        if (entry.name === 'AndroidManifest.xml') out.push(path.join(dir, entry.name));
        continue;
      }
      if (['build', '.gradle', '.git', 'node_modules', '__MACOSX'].includes(entry.name)) continue;
      walk(path.join(dir, entry.name), depth + 1);
    }
  };
  walk(root, 0);
  return out;
}

function findAppModules(root) {
  const modules = [];
  for (const name of listDirs(root)) {
    if (['build', '.gradle', '.git', 'gradle', '__MACOSX'].includes(name)) continue;
    const moduleDir = path.join(root, name);
    if (hasAnyFile(moduleDir, ['build.gradle', 'build.gradle.kts'])) modules.push(name);
  }
  return modules;
}

function isApplicationModule(root, moduleName) {
  for (const f of ['build.gradle', 'build.gradle.kts']) {
    const p = path.join(root, moduleName, f);
    if (fs.existsSync(p) && /com\.android\.application/.test(fs.readFileSync(p, 'utf8'))) return true;
  }
  return false;
}

/**
 * Validates that the extracted directory looks like a Gradle-based Android project.
 * Returns { ok, root, errors, warnings, modules, appModule }.
 */
function validateProject(extractedDir) {
  const errors = [];
  const warnings = [];
  const root = findProjectRoot(extractedDir);
  if (!root) {
    return {
      ok: false,
      root: null,
      errors: ['No Gradle project found: settings.gradle(.kts) / build.gradle(.kts) missing in the zip.'],
      warnings,
      modules: [],
      appModule: null,
    };
  }

  const manifests = findManifests(root);
  if (manifests.length === 0) errors.push('No AndroidManifest.xml found — this does not look like an Android project.');

  const modules = findAppModules(root);
  const appModule = modules.find((m) => isApplicationModule(root, m)) || (modules.includes('app') ? 'app' : null);
  if (!appModule) {
    if (modules.length === 0) errors.push('No Gradle module with a build.gradle(.kts) found.');
    else warnings.push(`No module applies com.android.application; will try the default assemble task. Modules: ${modules.join(', ')}`);
  }

  if (!hasAnyFile(root, ['settings.gradle', 'settings.gradle.kts'])) {
    warnings.push('settings.gradle is missing — it will be generated automatically.');
  }
  if (!fs.existsSync(path.join(root, 'gradlew'))) {
    warnings.push('Gradle wrapper (gradlew) is missing — the installed Gradle will be used instead.');
  }

  return { ok: errors.length === 0, root, errors, warnings, modules, appModule };
}

/**
 * Fills in the pieces an Android Studio export usually leaves out so the build can run headlessly.
 * Returns a list of human readable fixes applied.
 */
function prepareProject(root, { sdkDir, appModule, modules }) {
  const fixes = [];

  const localProps = path.join(root, 'local.properties');
  const sdkLine = `sdk.dir=${sdkDir}\n`;
  if (!fs.existsSync(localProps) || !fs.readFileSync(localProps, 'utf8').includes('sdk.dir=')) {
    fs.writeFileSync(localProps, sdkLine);
    fixes.push('local.properties written with the server SDK path');
  } else {
    fs.writeFileSync(localProps, sdkLine);
    fixes.push('local.properties sdk.dir rewritten to the server SDK path');
  }

  if (!hasAnyFile(root, ['settings.gradle', 'settings.gradle.kts'])) {
    const included = (appModule ? [appModule] : modules).map((m) => `include ':${m}'`).join('\n');
    fs.writeFileSync(
      path.join(root, 'settings.gradle'),
      `pluginManagement {\n  repositories {\n    google()\n    mavenCentral()\n    gradlePluginPortal()\n  }\n}\ndependencyResolutionManagement {\n  repositories {\n    google()\n    mavenCentral()\n  }\n}\n${included}\n`
    );
    fixes.push('settings.gradle generated');
  }

  const gradlew = path.join(root, 'gradlew');
  if (fs.existsSync(gradlew)) {
    fs.chmodSync(gradlew, 0o755);
    const wrapperProps = path.join(root, 'gradle', 'wrapper', 'gradle-wrapper.properties');
    const wrapperJar = path.join(root, 'gradle', 'wrapper', 'gradle-wrapper.jar');
    if (!fs.existsSync(wrapperProps) || !fs.existsSync(wrapperJar)) {
      fixes.push('gradle wrapper files incomplete — falling back to the installed Gradle');
      return { fixes, useWrapper: false };
    }
    // Normalise CRLF line endings from Windows zips, otherwise /bin/sh fails on gradlew.
    const content = fs.readFileSync(gradlew, 'utf8');
    if (content.includes('\r\n')) {
      fs.writeFileSync(gradlew, content.replace(/\r\n/g, '\n'));
      fixes.push('gradlew line endings converted from CRLF to LF');
    }
    return { fixes, useWrapper: true };
  }

  fixes.push('no gradle wrapper in the zip — using the Gradle installed on the server');
  return { fixes, useWrapper: false };
}

module.exports = { validateProject, prepareProject, findProjectRoot };
