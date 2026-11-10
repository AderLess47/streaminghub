/**
 * Public Android release served by the website.
 * Keep this in sync with android/app/build.gradle.kts and the object in Cloudflare R2.
 */
export const androidRelease = {
  version: "1.2.0",
  versionCode: 3,
  fileName: "streaminghub-1.2.0.apk",
  path: "https://downloads.streaminghub.org/streaminghub-1.2.0.apk",
  sizeLabel: "14 MB",
  sizeBytes: 14_284_820,
  sha256: "0d2a0a14b3e876c88c76cbce4ae14e677d2499ee8ac2396eebbcc30ceb57b6fa",
} as const;
