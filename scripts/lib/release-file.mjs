/**
 * Gemeinsamer Renderer/Validator für `src/content/release.ts`.
 *
 * Die Datei wird erzeugt; beide Schreiber (der Release-Build und der Abgleich
 * nach Produktion) müssen deshalb byte-identische Ausgabe erzeugen.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const RELEASE_FILE = path.join(ROOT, "src", "content", "release.ts");

export function formatSize(bytes) {
  const mib = bytes / (1024 * 1024);
  return mib >= 10 ? `${Math.round(mib)} MB` : `${mib.toFixed(1)} MB`;
}

export function renderRelease({ version, versionCode, fileName, url, sizeLabel, sizeBytes, sha256 }) {
  return `/**
 * Öffentliches Android-Release, das die Website ausliefert.
 * Erzeugt von scripts/release-apk.mjs und aktuell gehalten von scripts/release-sync.mjs.
 * Nicht von Hand bearbeiten.
 */
export const androidRelease = {
  version: ${JSON.stringify(version)},
  versionCode: ${versionCode},
  fileName: ${JSON.stringify(fileName)},
  path: ${JSON.stringify(url)},
  sizeLabel: ${JSON.stringify(sizeLabel)},
  sizeBytes: ${sizeBytes},
  sha256: ${JSON.stringify(sha256)},
} as const;
`;
}

/**
 * Nimmt die Antwort von `GET /api/release` (oder ein erzeugtes Release-Objekt)
 * entgegen und liefert den normalisierten Release oder null, wenn sich daraus
 * kein nutzbarer Download ergibt.
 */
export function validateRelease(payload) {
  if (!payload || typeof payload !== "object") return null;
  const version = String(payload.version ?? "").trim();
  const versionCode = Number(payload.versionCode);
  const sizeBytes = Number(payload.sizeBytes);
  const sha256 = String(payload.sha256 ?? "").trim().toLowerCase();
  const url = String(payload.url ?? "").trim();
  const fileName = String(payload.fileName ?? "").trim() || `streaminghub-${version}.apk`;

  if (!/^[0-9A-Za-z._+-]{1,32}$/.test(version)) return null;
  if (!Number.isSafeInteger(versionCode) || versionCode < 1) return null;
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1) return null;
  if (!/^[0-9a-f]{64}$/.test(sha256)) return null;
  if (!/^https:\/\/[^\s]+\.apk(?:\?[^\s]*)?$/.test(url)) return null;
  if (!/^[A-Za-z0-9._+-]+\.apk$/.test(fileName)) return null;
  if (!url.includes(`/${fileName}`)) return null;

  return { version, versionCode, fileName, url, sizeLabel: formatSize(sizeBytes), sizeBytes, sha256 };
}
