"use client";

import type { Ref } from "react";

/**
 * Die eine Live-Region im Projekt. Sie steht im DOM, bevor es etwas zu sagen
 * gibt, und wechselt nur ihren Text: Ein Element, das erst zusammen mit seiner
 * Meldung eingefügt wird, sagen Screenreader oft nicht an.
 *
 * `ref` wird durchgereicht, weil Aufrufer die Region manchmal im Baum brauchen
 * – `FormStatus` markiert von dort aus das umgebende Formular als `aria-busy`.
 */
export function LiveRegion({
  message,
  ref,
}: {
  message: string;
  ref?: Ref<HTMLParagraphElement>;
}) {
  return (
    <p ref={ref} role="status" className="sr-only">
      {message}
    </p>
  );
}
