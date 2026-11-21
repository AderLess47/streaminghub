"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { Dictionary } from "@/i18n/de";
import { CheckoutButton } from "./checkout-button";

/**
 * Preis-, Verlängerungs- und Zustimmungsteil des Checkouts.
 *
 * Beide Häkchen sind Pflicht und niemals vorausgewählt: die AGB-/Widerrufs-
 * informationen (§ 312j Abs. 3 BGB) und der ausdrückliche Wunsch, dass die
 * Leistung sofort beginnt, verbunden mit dem Verlust des Widerrufsrechts
 * (§ 356 Abs. 5 BGB). Der Server prüft dieselben Felder noch einmal.
 */
export function CheckoutActions({
  t,
  legal,
  configured,
  signedIn,
  disabledLabel,
  busyLabel,
  monthlyPrice,
  annualPrice,
  annualNote,
}: {
  t: Dictionary["checkout"];
  legal: { terms: string; subscriptionTerms: string; withdrawal: string };
  configured: boolean;
  signedIn: boolean;
  disabledLabel: string;
  busyLabel: string;
  monthlyPrice: string;
  annualPrice?: string;
  annualNote?: string;
}) {
  const id = useId();
  const termsId = `${id}-terms`;
  const withdrawalId = `${id}-withdrawal`;
  const monthlyTotalId = `${id}-total-monthly`;
  const annualTotalId = `${id}-total-annual`;
  const errorId = `${id}-consent-error`;
  const termsRef = useRef<HTMLInputElement>(null);
  const withdrawalRef = useRef<HTMLInputElement>(null);
  const [terms, setTerms] = useState(false);
  const [withdrawal, setWithdrawal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function block() {
    if (!terms) {
      setError(t.termsRequired);
      termsRef.current?.focus();
      return;
    }
    if (!withdrawal) {
      setError(t.withdrawalRequired);
      withdrawalRef.current?.focus();
    }
  }

  const consent = signedIn ? { terms, withdrawal } : undefined;

  return (
    <div className="grid gap-3">
      {signedIn ? (
        <div className="rounded-xl border border-line/60 bg-white/2 p-4">
          <p className="text-xs font-semibold text-fg">{t.consentTitle}</p>
          <p className="mt-1 text-[0.7rem] leading-relaxed text-muted/80">{t.contractNotice}</p>

          <label
            htmlFor={termsId}
            className="mt-3 flex items-start gap-2.5 text-xs leading-relaxed text-muted"
          >
            <input
              id={termsId}
              ref={termsRef}
              type="checkbox"
              checked={terms}
              onChange={(event) => {
                setTerms(event.target.checked);
                if (event.target.checked && withdrawal) setError(null);
              }}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errorId : undefined}
              className="mt-0.5 size-4 shrink-0 rounded border-line bg-ink accent-brand"
            />
            <span>
              {t.termsIntro}{" "}
              <Link href="/terms" className="link">
                {legal.terms}
              </Link>
              ,{" "}
              <Link href="/subscription-terms" className="link">
                {legal.subscriptionTerms}
              </Link>{" "}
              {t.termsAnd}{" "}
              <Link href="/withdrawal" className="link">
                {legal.withdrawal}
              </Link>
              .
            </span>
          </label>

          <label
            htmlFor={withdrawalId}
            className="mt-3 flex items-start gap-2.5 text-xs leading-relaxed text-muted"
          >
            <input
              id={withdrawalId}
              ref={withdrawalRef}
              type="checkbox"
              checked={withdrawal}
              onChange={(event) => {
                setWithdrawal(event.target.checked);
                if (event.target.checked && terms) setError(null);
              }}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? errorId : undefined}
              className="mt-0.5 size-4 shrink-0 rounded border-line bg-ink accent-brand"
            />
            <span>{t.withdrawalConsent}</span>
          </label>

          {error ? (
            <p id={errorId} role="alert" className="mt-2 text-xs leading-relaxed text-rose-300">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      <p id={monthlyTotalId} className="text-[0.7rem] leading-relaxed text-muted">
        {t.totalMonthly.replace("{price}", monthlyPrice)}
      </p>
      <CheckoutButton
        label={t.payNow}
        disabledLabel={disabledLabel}
        configured={configured}
        signedIn={signedIn}
        busyLabel={busyLabel}
        describedBy={monthlyTotalId}
        unavailableMessage={t.errorGeneric}
        networkMessage={t.errorNetwork}
        consent={consent}
        onConsentBlocked={block}
      />

      {annualPrice ? (
        <>
          <p id={annualTotalId} className="mt-1 text-[0.7rem] leading-relaxed text-muted">
            {t.totalAnnual.replace("{price}", annualPrice)}
          </p>
          <CheckoutButton
            label={t.payNow}
            disabledLabel={disabledLabel}
            configured={configured}
            signedIn={signedIn}
            interval="year"
            busyLabel={busyLabel}
            describedBy={annualTotalId}
            unavailableMessage={t.errorGeneric}
            networkMessage={t.errorNetwork}
            consent={consent}
            onConsentBlocked={block}
          />
          {annualNote ? <p className="text-[0.7rem] leading-relaxed text-muted">{annualNote}</p> : null}
        </>
      ) : null}
    </div>
  );
}
