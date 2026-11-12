"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LiveRegion } from "./live-region";

/**
 * Next.js tauscht bei der Client-Navigation nur den Seiteninhalt aus: Der Fokus
 * bleibt auf dem angeklickten Link stehen, und der neue Seitentitel wird nicht
 * angesagt. Deshalb setzt diese Komponente nach jedem Pfadwechsel den Fokus auf
 * das Hauptlandmark und meldet den neuen Titel über eine Live-Region.
 *
 * Nicht bei Ankersprüngen: dort ist das Sprungziel bereits das Fokusziel.
 * Und nicht bei reinen Query-Änderungen, weil der Pfad gleich bleibt.
 */
export function RouteAnnouncer() {
  const pathname = usePathname();
  const previousPath = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    // Beim ersten Rendern wird nichts angesagt und kein Fokus verschoben.
    if (previousPath.current === null || previousPath.current === pathname) {
      previousPath.current = pathname;
      return;
    }
    previousPath.current = pathname;

    if (window.location.hash) return;

    document.getElementById("main")?.focus({ preventScroll: true });

    // Erst leeren, dann im nächsten Frame setzen: sonst bleibt eine Ansage aus,
    // wenn zwei Seiten denselben Titel tragen.
    setAnnouncement("");
    const frame = window.requestAnimationFrame(() => {
      setAnnouncement(document.title || pathname);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  return <LiveRegion message={announcement} />;
}
