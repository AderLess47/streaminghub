/**
 * Android-Release-Metadaten, die die Website ausliefert.
 *
 * `src/content/release.ts` ist der erzeugte Fallback, den `npm run release:apk`
 * für lokale Builds schreibt. In Produktion kommen die Werte als
 * `APK_*`-Umgebungsvariablen: Der Workflow `Android-Release` legt sie als
 * Fly-Secrets ab, sodass eine neue APK ohne Commit auf den geschützten Branch
 * und ohne erneutes Deployment erscheint.
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
 * Die Umgebung zählt nur, wenn sie ein vollständiges Release beschreibt;
 * andernfalls hält die erzeugte Datei die Website konsistent.
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
