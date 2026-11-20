import Link from "next/link";
import { BackupPanel, type BackupLabels } from "@/components/backup-panel";
import { Alert, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { MAX_BACKUPS_PER_USER, backupAvailability, listBackups } from "@/lib/backup";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Cloud-Backup im Kundenkonto: anlegen, wiederherstellen, löschen. */
export default async function BackupPage() {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const copy = t.dashboard.backup;

  const availability = backupAvailability(user.id);
  const backups = listBackups(user.id);

  const labels: BackupLabels = {
    createCta: copy.createCta,
    creating: copy.creating,
    created: copy.created,
    failed: copy.failed,
    empty: copy.empty,
    restoreCta: copy.restoreCta,
    restoring: copy.restoring,
    restored: copy.restored,
    restoredNothing: copy.restoredNothing,
    playlistRestored: copy.playlistRestored,
    deleteCta: copy.deleteCta,
    deleting: copy.deleting,
    confirmDelete: copy.confirmDelete,
    createdAtLabel: copy.createdAtLabel,
    sizeLabel: copy.sizeLabel,
    restoredAtLabel: copy.restoredAtLabel,
  };

  const reason =
    availability.available
      ? null
      : availability.reason === "premium_required"
        ? copy.lockedPremium
        : availability.reason === "not_configured"
          ? copy.lockedNotConfigured
          : copy.lockedDisabled;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={t.dashboard.nav.backup}
        title={copy.title}
        description={copy.description}
      />

      {reason ? (
        <Alert tone="warning" title={copy.lockedTitle}>
          {reason}
          {availability.available === false && availability.reason === "premium_required" ? (
            <span className="mt-2 block">
              <Link href="/premium" className="link">
                {t.nav.premium}
              </Link>
            </span>
          ) : null}
        </Alert>
      ) : null}

      <section className="card p-5">
        <h2 className="text-base font-semibold">{copy.listTitle}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          {copy.limitNote.replace("{keep}", String(MAX_BACKUPS_PER_USER))}
        </p>
        <div className="mt-4">
          {availability.available ? (
            <BackupPanel labels={labels} backups={backups} locale={locale} />
          ) : (
            <p className="text-xs leading-relaxed text-muted">{copy.lockedListNote}</p>
          )}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold">{copy.aboutTitle}</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">{copy.aboutBody}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{copy.retentionNote}</p>
      </section>
    </div>
  );
}
