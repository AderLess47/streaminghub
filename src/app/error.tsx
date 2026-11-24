"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Die Fehlergrenze erhält keine Locale; das Dokument trägt sie im lang-Attribut.
  const [de, setDe] = useState(true);

  useEffect(() => {
    // The server logs the full error; the client only receives the digest.
    console.error("Application error", error.digest ?? "");
    setDe((document.documentElement.lang || "de") !== "en");
  }, [error]);

  return (
    <div className="shell flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <span className="grid size-12 place-items-center rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300">
        <Icon name="alert" size={22} />
      </span>
      <h1 className="mt-4 text-2xl font-semibold">
        {de ? "Etwas ist schiefgelaufen" : "Something went wrong"}
      </h1>
      <p className="mt-2 max-w-md text-sm text-muted">
        {de
          ? "Der Vorgang konnte nicht abgeschlossen werden. Bitte versuche es erneut oder kontaktiere den Support."
          : "The action could not be completed. Please try again or contact support."}
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-[0.7rem] text-muted">
          {de ? "Referenz" : "Reference"}: {error.digest}
        </p>
      ) : null}
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={reset} className="btn btn-primary">
          {de ? "Erneut versuchen" : "Try again"}
        </button>
        <Link href="/" className="btn btn-outline">
          {de ? "Zur Startseite" : "Back to home"}
        </Link>
      </div>
    </div>
  );
}
