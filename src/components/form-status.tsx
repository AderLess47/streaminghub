"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

/**
 * Meldet ein laufendes Formular an Screenreader. Die Live-Region steht von
 * Anfang an im DOM und ändert nur ihren Text – eine Region, die zusammen mit
 * ihrer Meldung entsteht, wird nicht zuverlässig angesagt.
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

  return (
    <p ref={ref} role="status" className="sr-only">
      {busy ? label : ""}
    </p>
  );
}
