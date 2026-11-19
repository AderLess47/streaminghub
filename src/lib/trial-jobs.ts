/**
 * Wartungsjobs für laufende Testzeiträume.
 *
 * Zwei Aufgaben, jede über einen eigenen Marker idempotent:
 * - Erinnerung: kurz vor Ablauf eine Mail, einmal pro Trial
 *   (`trial_reminder_sent_at`).
 * - Ablauf: Trial als beendet markieren (`trial_ended_at`) und einmal die
 *   Abschlussmail senden; wer inzwischen zahlt, bekommt keine Mail, dafür wird
 *   die Umwandlung in `trial_converted_at` festgehalten.
 *
 * Der Abo-Status bleibt unberührt: Nach dem Ende greift automatisch der
 * kostenlose Tarif, weil `getEntitlements()` nur ein laufendes `trial_ends_at`
 * zählt. Widerrufen wird nichts – Geräte und Playlist bleiben.
 *
 * Aufruf über `POST /api/internal/trial-jobs` aus einem Scheduler; jede
 * Ausführung ist wiederholbar. Nur serverseitig verwenden.
 */
import { timingSafeEqual } from "node:crypto";
import { all, run } from "./db";
import { sendMail, trialEndedMail, trialReminderMail } from "./mail";
import { PREMIUM_PRICE_EUR } from "./pricing";

/** Erinnerung kurz vor Schluss: früh genug zum Handeln, spät genug, um nicht zu nerven. */
export const REMINDER_WINDOW_HOURS = 48;
/** Obergrenze pro Lauf, damit ein einzelner Aufruf nie unbegrenzt Mails erzeugt. */
const BATCH_LIMIT = 200;

type TrialRow = {
  user_id: string;
  status: string;
  current_period_end: string | null;
  trial_ends_at: string;
  email: string;
  display_name: string;
  locale: string;
};

const ROW_SQL = `SELECT s.user_id, s.status, s.current_period_end, s.trial_ends_at,
       u.email, u.display_name, u.locale
  FROM subscriptions s
  JOIN users u ON u.id = s.user_id
 WHERE u.disabled_at IS NULL
   AND s.trial_ends_at IS NOT NULL`;

export type TrialJobSummary = {
  dryRun: boolean;
  /** Erinnerungen, die in diesem Lauf rausgingen. */
  reminders: number;
  /** Beendete Trials mit Abschlussmail. */
  expired: number;
  /** Trials, die bewusst keine Mail bekommen (z. B. inzwischen bezahlt). */
  skipped: number;
  /** Zeilen mit unbrauchbarem Datum oder fehlgeschlagenem Versand. */
  failed: number;
};

export type TrialJobInput = {
  /** Für Tests und reproduzierbare Läufe. */
  now?: number;
  /** Zählt nur, was passieren würde – ohne Schreiben und ohne Mail. */
  dryRun?: boolean;
};

export async function runTrialJobs(input: TrialJobInput = {}): Promise<TrialJobSummary> {
  const now = input.now ?? Date.now();
  const dryRun = input.dryRun === true;
  const nowDate = new Date(now).toISOString();
  const summary: TrialJobSummary = { dryRun, reminders: 0, expired: 0, skipped: 0, failed: 0 };

  // Zuerst abgelaufene Trials: Ein Trial, der genau jetzt endet, soll keine
  // Erinnerung mehr bekommen.
  for (const row of endedTrials(nowDate)) {
    if (!Number.isFinite(Date.parse(row.trial_ends_at))) {
      summary.failed++;
      continue;
    }

    const paid = subscriptionPays(row);
    if (!dryRun) {
      run(
        `UPDATE subscriptions
         SET trial_ended_at = ?, trial_converted_at = COALESCE(trial_converted_at, ?), updated_at = ?
         WHERE user_id = ? AND trial_ended_at IS NULL`,
        nowDate,
        paid ? nowDate : null,
        nowDate,
        row.user_id,
      );
    }

    // Wer schon zahlt, braucht keine „dein Test ist vorbei“-Mail.
    if (paid) {
      summary.skipped++;
      continue;
    }

    if (!dryRun) {
      try {
        await sendMail({
          to: row.email,
          ...trialEndedMail({
            name: row.display_name,
            locale: row.locale,
            priceEur: PREMIUM_PRICE_EUR,
          }),
          kind: "subscription",
        });
      } catch {
        summary.failed++;
        continue;
      }
    }
    summary.expired++;
  }

  for (const row of reminderTrials(now, nowDate)) {
    if (!Number.isFinite(Date.parse(row.trial_ends_at))) {
      summary.failed++;
      continue;
    }
    // Die Abfrage schließt zahlende Konten schon aus; die Prüfung bleibt als
    // Sicherheitsnetz, falls sich der Status zwischen Abfrage und Lauf ändert.
    if (subscriptionPays(row)) {
      summary.skipped++;
      continue;
    }

    if (!dryRun) {
      // Vor dem Versand markieren: Die Mail liegt danach im Outbox-Protokoll,
      // ein Providerfehler wird dort erneut versucht statt doppelt zu mailen.
      run(
        `UPDATE subscriptions SET trial_reminder_sent_at = ?, updated_at = ?
         WHERE user_id = ? AND trial_reminder_sent_at IS NULL`,
        nowDate,
        nowDate,
        row.user_id,
      );
      try {
        await sendMail({
          to: row.email,
          ...trialReminderMail({
            name: row.display_name,
            locale: row.locale,
            trialEndsAt: row.trial_ends_at,
            priceEur: PREMIUM_PRICE_EUR,
          }),
          kind: "subscription",
        });
      } catch {
        summary.failed++;
        continue;
      }
    }
    summary.reminders++;
  }

  return summary;
}

/** Trials, deren Ende erreicht ist und die noch nicht als beendet vermerkt sind. */
function endedTrials(nowDate: string): TrialRow[] {
  return all<TrialRow>(
    `${ROW_SQL}
       AND s.trial_ended_at IS NULL
       AND s.trial_ends_at <= ?
     ORDER BY s.trial_ends_at
     LIMIT ${BATCH_LIMIT}`,
    nowDate,
  );
}

/** Laufende Trials innerhalb des Erinnerungsfensters, die noch keine Mail hatten. */
function reminderTrials(now: number, nowDate: string): TrialRow[] {
  const until = new Date(now + REMINDER_WINDOW_HOURS * 3_600_000).toISOString();
  return all<TrialRow>(
    `${ROW_SQL}
       AND s.trial_ended_at IS NULL
       AND s.trial_reminder_sent_at IS NULL
       AND s.trial_ends_at > ?
       AND s.trial_ends_at <= ?
       AND s.status NOT IN ('active', 'past_due')
     ORDER BY s.trial_ends_at
     LIMIT ${BATCH_LIMIT}`,
    nowDate,
    until,
  );
}

function subscriptionPays(row: TrialRow): boolean {
  return row.status === "active" || row.status === "past_due";
}

export type JobAuth = "ok" | "not_configured" | "forbidden";

/**
 * Zugangsschutz für interne Job-Endpunkte. Ohne konfiguriertes Token bleibt der
 * Endpunkt aus, statt offen zu stehen; der Vergleich läuft zeitkonstant.
 */
export function authorizeJob(provided: string | null, expected: string): JobAuth {
  if (!expected) return "not_configured";
  const candidate = Buffer.from(provided ?? "");
  const reference = Buffer.from(expected);
  return candidate.length === reference.length && timingSafeEqual(candidate, reference)
    ? "ok"
    : "forbidden";
}
