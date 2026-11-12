"use client";

/**
 * Setzt den Fokus nach dem nächsten Frame auf ein Element.
 * Nötig, weil Meldungen erst nach dem State-Update im DOM stehen und
 * Tastaturnutzer sonst nach dem Absenden wieder am Seitenanfang landen.
 */
export function focusSoon(id: string | null) {
  if (!id) return;
  requestAnimationFrame(() => {
    document.getElementById(id)?.focus();
  });
}
