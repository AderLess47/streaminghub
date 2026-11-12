"use client";

import { useEffect } from "react";

/**
 * Setzt den Fokus auf eine Meldung, die nach einer Server-Action neu gerendert wurde.
 * Eine Live-Region, die erst mit dem Seitenaufbau entsteht, wird von Screenreadern
 * nicht zuverlässig angesagt; über den Fokus wird der Text vorgelesen.
 */
export function FocusOnMount({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.focus();
  }, [targetId]);

  return null;
}
