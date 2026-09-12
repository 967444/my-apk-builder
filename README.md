# ZIP → APK Builder

Upload an Android Studio project as a `.zip`, set the **app name, icon, package/version and
permissions**, and the server verifies the project, fixes the usual missing pieces (SDK path,
settings.gradle, gradle wrapper permissions/line endings), runs a Gradle build and serves the
resulting APK for download. Build output is streamed live to the browser.

## Customisation applied before the build

| Setting | Where it lands |
| --- | --- |
| App name (required) | `android:label` on `<application>` (and on the launcher `<activity>` if it had its own label); also used as the APK file name: `<App-Name>-v<version>-<variant>.apk` |
| Icon (PNG/JPG/WebP) | resized into `res/mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_builder.png`, set as `android:icon` + `android:roundIcon` |
| Package name | `applicationId` in `defaultConfig` (+ `package=` in the manifest if present) |
| Version name / code | `versionName` / `versionCode` in `defaultConfig` |
| Permissions | `<uses-permission android:name="…">` entries; ~110 permissions in 11 groups (network, camera/mic, notifications, storage/gallery, location, contacts/calendar, phone/SMS, Bluetooth/NFC, sensors/health, background/system, device). Only keys from the server catalog (`src/permissions.js`) are accepted. |

## What it does with an uploaded zip

1. Extract and locate the real project root (handles zips wrapped in one folder, ignores `__MACOSX`).
2. Verify it is an Android Gradle project: `settings.gradle`/`build.gradle`, an `AndroidManifest.xml`,
   and a module applying `com.android.application`.
3. Auto-fix common gaps:
   - write `local.properties` with the server's `sdk.dir`
   - generate `settings.gradle` with google()/mavenCentral() repositories when missing
   - `chmod +x gradlew` and convert CRLF → LF (Windows zips)
   - fall back to the system Gradle when the wrapper is missing or incomplete
4. Run `:<app>:assembleDebug` (or `assembleRelease`) and collect every `.apk` under `build/`.

## Local run

```bash
npm install
export ANDROID_SDK_ROOT=/path/to/android-sdk
npm start           # http://localhost:3000
```

Requirements: JDK 17, Android SDK (platform 34 + build-tools 34.0.0), Gradle 8.x on PATH
(only needed for projects without a wrapper).

## Docker (recommended — SDK and Gradle baked in)

```bash
docker compose up --build      # http://localhost:3000
```

## Deploy

Any host that can run a container with ~6 GB disk and 4 GB RAM works. The image already
contains the JDK, Android SDK and Gradle, so no extra setup is needed.

- **Fly.io** (`fly.toml` included): `fly launch --copy-config --no-deploy`, `fly volumes create apk_builder_data --size 20`, `fly deploy`.
- **Render** (`render.yaml` included): New → Blueprint → point at this repo; the disk at `/data` is created automatically.
- **Railway**: new service from this repo (Dockerfile is detected), set port `3000`, add a volume at `/data`.
- **Any VM**: `docker compose up -d --build` behind nginx/Caddy for TLS.

Persist `/data` (builds and APKs) and `/opt/gradle-home` (Gradle cache) for much faster rebuilds.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `WORK_ROOT` | `$TMPDIR/apk-builder` | Uploads, extracted projects, built APKs |
| `ANDROID_SDK_ROOT` | `/opt/android-sdk` | Android SDK location |
| `MAX_ZIP_MB` | `500` | Upload size limit |
| `BUILD_TIMEOUT_MS` | `1200000` | Per-build timeout (20 min) |
| `MAVEN_CENTRAL_MIRROR` | unset | Optional Maven Central mirror URL (e.g. `https://maven-central.storage-download.googleapis.com/maven2/`) used when the host gets HTTP 429 from repo.maven.apache.org |

## API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/builds` | multipart: `project` (zip, required), `appName` (required), `icon` (image), `packageName`, `versionName`, `versionCode`, `permissions` (JSON array of keys), `variant=debug\|release` → `{ id }` |
| `GET` | `/api/permissions` | permission catalog (key, Android name, label, group, runtime flag) |
| `GET` | `/api/builds` | list builds |
| `GET` | `/api/builds/:id` | build status, applied fixes, warnings, APK list |
| `GET` | `/api/builds/:id/logs` | SSE live build log |
| `GET` | `/api/builds/:id/apk?file=...` | download an APK |
| `GET` | `/api/health` | installed SDK platforms and build-tools |

Release builds are unsigned (`assembleRelease` without signing config) unless the uploaded project
brings its own signing configuration and keystore.
