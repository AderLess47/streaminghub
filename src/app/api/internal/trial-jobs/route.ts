import { apiError, json } from "@/lib/api";
import { env } from "@/lib/env";
import { authorizeJob, runTrialJobs } from "@/lib/trial-jobs";

export const runtime = "nodejs";

/**
 * Trial-Wartung (Erinnerung vor Ablauf, Ablaufmarkierung), aufgerufen von einem
 * Scheduler mit gemeinsamem Token – nie aus dem Browser.
 *
 * `?dryRun=1` zählt nur, was passieren würde, ohne zu schreiben oder zu mailen.
 * Jeder Lauf ist wiederholbar; die Marker in `subscriptions` verhindern
 * doppelte Mails.
 */
export async function POST(request: Request) {
  const auth = authorizeJob(request.headers.get("x-trial-job-token"), env.trialJobToken);
  if (auth === "not_configured") {
    return apiError("not_configured", "Trial-Jobs sind nicht konfiguriert.");
  }
  if (auth === "forbidden") return apiError("forbidden", "Ungültiges Job-Token.");

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const summary = await runTrialJobs({ dryRun });

  return json({ ok: true, ...summary });
}
