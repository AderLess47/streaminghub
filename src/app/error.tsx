"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/icons";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server logs the full error; the client only receives the digest.
    console.error("Application error", error.digest ?? "");
  }, [error]);

  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300">
        <Icon name="alert" size={22} />
      </span>
      <h1 className="mt-4 text-2xl font-semibold">Etwas ist schiefgelaufen</h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        Der Vorgang konnte nicht abgeschlossen werden. Bitte versuche es erneut oder kontaktiere den Support.
      </p>
      {error.digest ? <p className="mt-2 font-mono text-[0.7rem] text-muted">Referenz: {error.digest}</p> : null}
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          Erneut versuchen
        </button>
        <Link href="/" className="btn btn-outline">
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}
