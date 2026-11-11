import { androidRelease } from "@/lib/android-release";

export const dynamic = "force-dynamic";

/**
 * Machine-readable release metadata. `scripts/release-sync.mjs` reads it to keep
 * `src/content/release.ts` in step with what production serves.
 */
export function GET() {
  return Response.json(
    {
      version: androidRelease.version,
      versionCode: androidRelease.versionCode,
      fileName: androidRelease.fileName,
      sizeBytes: androidRelease.sizeBytes,
      sizeLabel: androidRelease.sizeLabel,
      sha256: androidRelease.sha256,
      url: androidRelease.path,
    },
    { headers: { "cache-control": "public, max-age=60, s-maxage=60" } },
  );
}
