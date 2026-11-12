"use client";

import { useFormStatus } from "react-dom";
import { LiveRegion } from "./live-region";

/**
 * Meldet ein laufendes Formular an Screenreader.
 *
 * Den Laufzustand kennt das Formular selbst: Client-Formulare geben ihn als
 * `pending` mit und tragen ihn als `aria-busy` am `<form>`. Die Admin-Formulare
 * mit Server Action haben keinen eigenen Zustand, dort liest `useFormStatus`
 * ihn aus dem Formular-Kontext – `aria-busy` setzt dort niemand, weil das
 * Attribut am Elternelement nur vom Elternelement kommen kann.
 */
export function FormStatus({ label, pending }: { label: string; pending?: boolean }) {
  const formStatus = useFormStatus();
  const busy = pending ?? formStatus.pending;

  return <LiveRegion message={busy ? label : ""} />;
}
