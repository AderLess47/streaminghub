"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Waagerecht scrollbarer Bereich mit Namen. Er landet nur dann in der Tab-Reihenfolge,
 * wenn er tatsächlich scrollt – sonst entstünde auf breiten Bildschirmen ein toter Stopp.
 */
export function ScrollRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => setScrollable(element.scrollWidth > element.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      tabIndex={scrollable ? 0 : undefined}
      className={className}
    >
      {children}
    </div>
  );
}
