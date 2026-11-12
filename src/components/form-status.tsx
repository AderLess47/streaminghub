"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { LiveRegion } from "./live-region";

/**
 * Meldet ein laufendes Formular an Screenreader.
 *
 * Das umgebende Formular bekommt hier auch `aria-busy`: Formulare mit
 * Server-Action kennen ihren Zustand selbst nicht, und ein Attribut am
 * `<form>` lässt sich aus dem Kind heraus nur so setzen.
 */
export function FormStatus({ label, pending }: { label: string; pending?: boolean }) {
  const formStatus = useFormStatus();
  const busy = pending ?? formStatus.pending;
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    if (busy) form.setAttribute("aria-busy", "true");
    else form.removeAttribute("aria-busy");
  }, [busy]);

  return <LiveRegion ref={ref} message={busy ? label : ""} />;
}
