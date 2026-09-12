const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ICON_NAME = 'ic_launcher_builder';
const ICON_SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

function escapeXml(value) {
  return value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

function setAttr(tag, attr, value) {
  const re = new RegExp(`${attr}\\s*=\\s*("[^"]*"|'[^']*')`);
  if (re.test(tag)) return tag.replace(re, `${attr}="${value}"`);
  return tag.replace(/^<(\w+)/, `<$1 ${attr}="${value}"`);
}

function findMainManifest(moduleDir) {
  const candidate = path.join(moduleDir, 'src', 'main', 'AndroidManifest.xml');
  if (fs.existsSync(candidate)) return candidate;
  const stack = [moduleDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!['build', '.gradle', 'test', 'androidTest'].includes(entry.name)) stack.push(path.join(dir, entry.name));
      } else if (entry.name === 'AndroidManifest.xml') return path.join(dir, entry.name);
    }
  }
  return null;
}

function findModuleGradle(moduleDir) {
  for (const f of ['build.gradle.kts', 'build.gradle']) {
    const p = path.join(moduleDir, f);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function applyManifest(manifestPath, { appName, permissions, packageName, useCustomIcon }, log) {
  let xml = fs.readFileSync(manifestPath, 'utf8');
  const manifestOpen = xml.match(/<manifest\b[^>]*>/);
  if (!manifestOpen) throw new Error('AndroidManifest.xml has no <manifest> root element.');

  if (permissions.length) {
    const missing = permissions.filter((p) => !xml.includes(`android:name="${p.name}"`));
    if (missing.length) {
      const block = missing.map((p) => `    <uses-permission android:name="${p.name}" />`).join('\n');
      xml = xml.replace(manifestOpen[0], `${manifestOpen[0]}\n${block}`);
      log(`Added ${missing.length} permission(s): ${missing.map((p) => p.key).join(', ')}`);
    }
    const already = permissions.length - missing.length;
    if (already) log(`${already} selected permission(s) were already declared.`);
  }

  const application = xml.match(/<application\b[^>]*>/);
  if (!application) throw new Error('AndroidManifest.xml has no <application> element.');
  let appTag = application[0];
  if (appName) appTag = setAttr(appTag, 'android:label', escapeXml(appName));
  if (useCustomIcon) {
    appTag = setAttr(appTag, 'android:icon', `@mipmap/${ICON_NAME}`);
    appTag = setAttr(appTag, 'android:roundIcon', `@mipmap/${ICON_NAME}`);
  }
  xml = xml.replace(application[0], appTag);

  if (appName) {
    // Launcher activities often carry their own label which overrides the application label.
    xml = xml.replace(/<activity\b[^>]*>[\s\S]*?<\/activity>|<activity\b[^>]*\/>/g, (activity) => {
      if (!activity.includes('android.intent.category.LAUNCHER')) return activity;
      const open = activity.match(/<activity\b[^>]*>/)[0];
      if (!/android:label\s*=/.test(open)) return activity;
      return activity.replace(open, setAttr(open, 'android:label', escapeXml(appName)));
    });
  }

  if (packageName && /\spackage\s*=/.test(manifestOpen[0])) {
    xml = xml.replace(manifestOpen[0], setAttr(manifestOpen[0], 'package', packageName));
  }

  fs.writeFileSync(manifestPath, xml);
}

function applyGradle(gradlePath, { packageName, versionName, versionCode }, log) {
  let src = fs.readFileSync(gradlePath, 'utf8');
  const kts = gradlePath.endsWith('.kts');
  const eq = kts ? ' = ' : ' ';
  const defaultConfig = src.match(/defaultConfig\s*\{([\s\S]*?)\n(\s*)\}/);
  if (!defaultConfig) {
    log('warning: no defaultConfig block found; applicationId/version were not changed.');
    return;
  }
  let body = defaultConfig[1];
  const indent = (defaultConfig[2] || '    ') + '    ';
  const set = (key, value, pattern) => {
    if (value === undefined || value === null || value === '') return;
    if (pattern.test(body)) body = body.replace(pattern, `${key}${eq}${value}`);
    else body += `\n${indent}${key}${eq}${value}`;
  };
  if (packageName) set('applicationId', `"${packageName}"`, /applicationId\s*=?\s*["'][^"']*["']/);
  if (versionName) set('versionName', `"${versionName}"`, /versionName\s*=?\s*["'][^"']*["']/);
  if (versionCode) set('versionCode', String(versionCode), /versionCode\s*=?\s*\d+/);
  src = src.replace(defaultConfig[0], `defaultConfig {${body}\n${defaultConfig[2]}}`);
  fs.writeFileSync(gradlePath, src);
  log(
    `Gradle defaultConfig updated${packageName ? ` applicationId=${packageName}` : ''}${versionName ? ` versionName=${versionName}` : ''}${versionCode ? ` versionCode=${versionCode}` : ''}`
  );
}

async function writeIcons(manifestPath, iconPath, log) {
  const resDir = path.join(path.dirname(manifestPath), 'res');
  const source = sharp(iconPath).ensureAlpha();
  for (const [density, size] of Object.entries(ICON_SIZES)) {
    const dir = path.join(resDir, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const buf = await source
      .clone()
      .resize(size, size, { fit: 'cover' })
      .png()
      .toBuffer();
    fs.writeFileSync(path.join(dir, `${ICON_NAME}.png`), buf);
  }
  // Remove any adaptive-icon XML that would shadow the PNGs for our resource name.
  for (const dir of ['mipmap-anydpi-v26', 'mipmap-anydpi']) {
    const p = path.join(resDir, dir, `${ICON_NAME}.xml`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  log(`Launcher icon generated for ${Object.keys(ICON_SIZES).length} densities from the uploaded image.`);
}

/**
 * Applies app identity (name, package, version, icon, permissions) to the module in `moduleDir`.
 */
async function applyIdentity(moduleDir, identity, log) {
  const manifestPath = findMainManifest(moduleDir);
  if (!manifestPath) throw new Error(`No AndroidManifest.xml found in module ${path.basename(moduleDir)}.`);
  const useCustomIcon = Boolean(identity.iconPath);
  if (useCustomIcon) await writeIcons(manifestPath, identity.iconPath, log);
  applyManifest(manifestPath, { ...identity, useCustomIcon }, log);
  if (identity.appName) log(`App name set to "${identity.appName}".`);

  const gradlePath = findModuleGradle(moduleDir);
  if (gradlePath && (identity.packageName || identity.versionName || identity.versionCode)) {
    applyGradle(gradlePath, identity, log);
  } else if (!gradlePath) {
    log('warning: module build.gradle not found; applicationId/version were not changed.');
  }
}

module.exports = { applyIdentity };
