"use client";

import { useEffect, useRef } from "react";

/**
 * Ein deaktivierter Absende-Knopf verliert den Fokus; ohne Rückgabe steht die
 * Tastatur danach auf <body> und beginnt wieder am Seitenanfang. Der Hook merkt
 * sich, dass abgesendet wurde, und holt den Fokus nach dem Abschluss zurück.
 */
export function useSubmitFocus(pending: boolean) {
  const ref = useRef<HTMLButtonElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (wasPending.current) {
      wasPending.current = false;
      ref.current?.focus();
    }
  }, [pending]);

  return ref;
}
