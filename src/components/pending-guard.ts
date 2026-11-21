"use client";

import type { FormEvent } from "react";

/**
 * `aria-disabled` hält den Knopf im Tastaturfluss, verhindert aber keine
 * zweite Formular-Aktion. Formulare mit Server Action hängen diesen Handler an
 * `onSubmit`; solange die erste Anfrage läuft, wird ein zweiter Absende-Versuch
 * verworfen.
 */
export function blockWhilePending(pending: boolean) {
  return (event: FormEvent<HTMLFormElement>) => {
    if (pending) event.preventDefault();
  };
}
