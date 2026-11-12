/**
 * Android release metadata served by the website.
 *
 * `src/content/release.ts` is the generated fallback that `npm run release:apk`
 * writes for local builds. In production the values arrive as `APK_*`
 * environment variables: the Android release workflow stores them as Fly
 * secrets, so a new APK is published without a commit to the protected branch
 * and without a redeploy.
 */
import { androidRelease as generatedRelease } from "../content/release";

export type AndroidRelease = {
  version: string;
  versionCode: number;
  fileName: string;
  path: string;
  sizeLabel: string;
  sizeBytes: number;
  sha256: string;
};

const text = (value: string | undefined) => value?.trim() ?? "";

const formatSize = (bytes: number) => {
  const mib = bytes / (1024 * 1024);
  return mib >= 10 ? `${Math.round(mib)} MB` : `${mib.toFixed(1)} MB`;
};

const version = text(process.env.APK_VERSION);
const versionCode = Number(text(process.env.APK_VERSION_CODE) || 0);
const sha256 = text(process.env.APK_SHA256).toLowerCase();
const url = text(process.env.APK_URL);
const sizeBytes = Number(text(process.env.APK_SIZE_BYTES) || 0);
const fileName = text(process.env.APK_FILE_NAME) || (version ? `streaminghub-${version}.apk` : "");

/**
 * The environment is only trusted when it describes a complete release;
 * otherwise the generated file keeps the site consistent.
 */
const published =
  Boolean(version) &&
  versionCode > 0 &&
  sizeBytes > 0 &&
  /^[0-9a-f]{64}$/.test(sha256) &&
  /^https:\/\//.test(url) &&
  fileName.endsWith(".apk");

export const androidRelease: AndroidRelease = published
  ? {
      version,
      versionCode,
      fileName,
      path: url,
      sizeLabel: formatSize(sizeBytes),
      sizeBytes,
      sha256,
    }
  : generatedRelease;
