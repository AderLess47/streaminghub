"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * After Stripe redirects back, ask the server to verify the session. The
 * browser never decides whether a payment succeeded.
 */
export function CheckoutSync({ sessionId, label }: { sessionId: string; label: string }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const key = `sh:checkout:${sessionId}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      /* storage blocked – still reconcile once per mount */
    }

    void fetch("/api/subscription/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then((response) => {
        if (response.ok) router.refresh();
      })
      .catch(() => undefined);
  }, [router, sessionId]);

  return (
    <p className="text-xs text-muted" role="status">
      {label}
    </p>
  );
}
