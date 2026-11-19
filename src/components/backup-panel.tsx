"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";

export type BackupItem = {
  id: string;
  createdAt: string;
  sizeBytes: number;
  restoredAt: string | null;
};

export type BackupLabels = {
  createCta: string;
  creating: string;
  created: string;
  failed: string;
  empty: string;
  restoreCta: string;
  restoring: string;
  restored: string;
  restoredNothing: string;
  playlistRestored: string;
  deleteCta: string;
  deleting: string;
  confirmDelete: string;
  createdAtLabel: string;
  sizeLabel: string;
  restoredAtLabel: string;
};

type Props = {
  labels: BackupLabels;
  backups: BackupItem[];
  locale: string;
};

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const formatDate = (iso: string, locale: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
};

/**
 * Anlegen, Wiederherstellen und Löschen von Sicherungen.
 *
 * Die Knöpfe sprechen ausschließlich mit den Backup-Routen; Rechte und
 * Aufbewahrung prüft der Server. Nach jeder Änderung wird die Seite neu
 * geladen, damit die Liste den Serverzustand zeigt.
 */
export function BackupPanel({ labels, backups, locale }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const call = async (path: string, init: RequestInit) => {
    const response = await fetch(path, { headers: { "content-type": "application/json" }, ...init });
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      restored?: { progress: number; playlist: boolean };
    };
    if (!response.ok) throw new Error(data.error?.message ?? labels.failed);
    return data;
  };

  const create = async () => {
    setBusy("create");
    setMessage(null);
    try {
      await call("/api/backup", { method: "POST" });
      setMessage({ tone: "ok", text: labels.created });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : labels.failed });
    } finally {
      setBusy(null);
    }
  };

  const restore = async (id: string) => {
    setBusy(`restore:${id}`);
    setMessage(null);
    try {
      const data = await call(`/api/backup/${id}/restore`, { method: "POST" });
      const restored = data.restored;
      const text =
        restored && restored.progress > 0
          ? labels.restored.replace("{count}", String(restored.progress)) +
            (restored.playlist ? ` ${labels.playlistRestored}` : "")
          : labels.restoredNothing;
      setMessage({ tone: "ok", text });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : labels.failed });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm(labels.confirmDelete)) return;
    setBusy(`delete:${id}`);
    setMessage(null);
    try {
      await call(`/api/backup/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : labels.failed });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={create}
          disabled={busy !== null}
          className="btn btn-primary btn-sm"
        >
          <Icon name="plus" size={15} />
          {busy === "create" ? labels.creating : labels.createCta}
        </button>
      </div>

      {message ? (
        <p
          role="status"
          className={`text-xs leading-relaxed ${message.tone === "ok" ? "text-emerald-300" : "text-rose-300"}`}
        >
          {message.text}
        </p>
      ) : null}

      {backups.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted">{labels.empty}</p>
      ) : (
        <ul className="grid gap-2">
          {backups.map((backup) => (
            <li
              key={backup.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/60 bg-white/2 p-3"
            >
              <div className="min-w-0">
                <p className="text-[0.88rem] font-medium">
                  {labels.createdAtLabel}: {formatDate(backup.createdAt, locale)}
                </p>
                <p className="text-[0.7rem] text-muted">
                  {labels.sizeLabel}: {formatSize(backup.sizeBytes)}
                  {backup.restoredAt
                    ? ` · ${labels.restoredAtLabel}: ${formatDate(backup.restoredAt, locale)}`
                    : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => restore(backup.id)}
                  disabled={busy !== null}
                  className="btn btn-ghost btn-sm"
                >
                  <Icon name="refresh" size={15} />
                  {busy === `restore:${backup.id}` ? labels.restoring : labels.restoreCta}
                </button>
                <button
                  type="button"
                  onClick={() => remove(backup.id)}
                  disabled={busy !== null}
                  className="btn btn-ghost btn-sm text-rose-300"
                  aria-label={labels.deleteCta}
                >
                  <Icon name="trash" size={15} />
                  {busy === `delete:${backup.id}` ? labels.deleting : labels.deleteCta}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
