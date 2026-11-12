import type { ReactNode } from "react";

/**
 * Meldungen leben in dauerhaft gerenderten Live-Regionen. Ein Element, das erst
 * zusammen mit seinem Text erscheint, wird von Screenreadern oft nicht angesagt
 * – der Container muss schon vor der Antwort im DOM stehen. Erfolg läuft
 * höflich, Fehler sofort.
 */
export function LiveMessage({
  ok,
  message,
  className,
}: {
  ok: boolean;
  message?: ReactNode;
  className?: string;
}) {
  return (
    <>
      <div aria-live="polite" aria-atomic="true">
        {message && ok ? <p className={className}>{message}</p> : null}
      </div>
      <div aria-live="assertive" aria-atomic="true">
        {message && !ok ? <p className={className}>{message}</p> : null}
      </div>
    </>
  );
}
