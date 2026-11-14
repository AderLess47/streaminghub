import Link from "next/link";
import { CancelSubscriptionForm } from "@/components/cancel-subscription-form";
import { CheckoutButton } from "@/components/checkout-button";
import { CheckoutSync } from "@/components/checkout-sync";
import { Icon } from "@/components/icons";
import { Alert, Badge, InfoRow, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { cancelSubscriptionAction } from "@/lib/actions/dashboard";
import { billingConfigured, effectiveStatus, ensureSubscription, PREMIUM_PRICE_EUR } from "@/lib/payments";
import { requireUser } from "@/lib/session";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const params = await searchParams;
  const subscription = ensureSubscription(user.id);
  const status = effectiveStatus(subscription);
  const configured = billingConfigured();

  const statusLabel =
    status === "active"
      ? t.dashboard.overview.planPremium
      : status === "pending"
        ? t.dashboard.overview.planPending
        : status === "past_due"
          ? t.dashboard.subscription.statusPastDue
          : status === "canceled"
            ? t.dashboard.subscription.statusEnded
            : status === "incomplete"
              ? t.dashboard.subscription.statusIncomplete
              : t.dashboard.overview.planNone;

  const periodEnd = subscription.current_period_end
    ? new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-GB", { dateStyle: "long" }).format(
        new Date(subscription.current_period_end),
      )
    : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow={t.dashboard.nav.subscription}
        title={t.dashboard.subscription.title}
        description={t.dashboard.subscription.subtitle}
      />

      {params.checkout === "success" ? (
        <div className="grid gap-2">
          <Alert tone="success" id="checkout-flash" autoFocus>
            {t.dashboard.subscription.checkoutSuccess}
          </Alert>
          {params.session_id?.startsWith("cs_") ? (
            <CheckoutSync
              sessionId={params.session_id}
              label={t.dashboard.subscription.checkoutConfirming}
            />
          ) : null}
        </div>
      ) : null}
      {params.checkout === "canceled" ? (
        <Alert tone="info" id="checkout-canceled" autoFocus>
          {t.dashboard.subscription.checkoutCanceled}
        </Alert>
      ) : null}
      {/* Der Hinweis auf den fehlenden Zahlungsanbieter steht am deaktivierten
          Checkout-Knopf; oben würde derselbe Satz ein zweites Mal erscheinen. */}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">StreamingHub Premium</h2>
            <Badge tone={status === "active" ? "ok" : status === "pending" ? "warn" : "neutral"}>{statusLabel}</Badge>
          </div>
          <div className="mt-4">
            <InfoRow label={t.dashboard.subscription.currentPlan} value="Premium" />
            <InfoRow label={t.dashboard.subscription.status} value={statusLabel} />
            <InfoRow
              label={t.dashboard.subscription.channel}
              value={
                subscription.channel === "amazon"
                  ? t.dashboard.subscription.channelAmazon
                  : subscription.channel === "apple"
                    ? t.dashboard.subscription.channelApple
                    : t.dashboard.subscription.channelWeb
              }
            />
            <InfoRow label={t.dashboard.subscription.renewsAt} value={periodEnd ?? "—"} />
            <InfoRow
              label={t.premium.price}
              value={locale === "de" ? "2,49 € / Monat; keine USt. (Kleinunternehmerregelung)" : `€${PREMIUM_PRICE_EUR.toFixed(2)} / month; no VAT (small business regulation)`}
            />
          </div>
          {/* Nach dem Periodenende ist die Kündigung vorbei, nicht mehr vorgemerkt. */}
          {subscription.cancel_at_period_end && status === "active" ? (
            <p className="mt-3 text-xs text-amber-300">{t.dashboard.subscription.cancelAtPeriodEnd}</p>
          ) : null}

          {subscription.channel === "amazon" ? (
            <p className="mt-4 rounded-xl border border-line/60 bg-white/2 px-3.5 py-3 text-xs leading-relaxed text-muted">
              {t.dashboard.subscription.amazonNotice}
            </p>
          ) : null}

          {subscription.channel === "apple" ? (
            <p className="mt-4 rounded-xl border border-line/60 bg-white/2 px-3.5 py-3 text-xs leading-relaxed text-muted">
              {t.dashboard.subscription.appleNotice}
            </p>
          ) : null}

          {/* Nach der Kündigung ist die Handlung erledigt; der Hinweis oben nennt
              bereits das Periodenende, ein zweiter Klick wäre nur ein Duplikat. */}
          {status === "active" && subscription.channel === "web" && !subscription.cancel_at_period_end ? (
            <CancelSubscriptionForm action={cancelSubscriptionAction} label={t.dashboard.subscription.cancelCta} />
          ) : null}

          {status === "canceled" ? (
            <p className="mt-4 text-xs leading-relaxed text-muted">
              {t.dashboard.subscription.subscriptionEnded}
            </p>
          ) : status !== "active" ? (
            <p className="mt-4 text-xs leading-relaxed text-muted">{t.dashboard.subscription.noSubscription}</p>
          ) : null}
        </div>

        <div className="grid gap-4">
          {/* Bei aktivem Abo bietet der Server keinen zweiten Abschluss an
              (already_active) – dann wird die Handlung auch nicht angeboten. */}
          {status !== "active" ? (
            <div className="card p-5">
              <h2 className="text-sm font-semibold">{t.premium.ctaPrimary}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">{t.dashboard.subscription.priceNote}</p>
              <div className="mt-4">
                <CheckoutButton
                  label={t.dashboard.subscription.startCta}
                  disabledLabel={t.dashboard.subscription.checkoutNotConfigured}
                  configured={configured}
                  signedIn
                />
              </div>
              <Link href="/premium" className="btn btn-ghost btn-sm btn-block mt-2">
                {t.nav.premium}
                <Icon name="arrow-right" size={14} />
              </Link>
            </div>
          ) : null}

          <div className="card p-5">
            <h2 className="text-sm font-semibold">{t.legal.subscriptionTerms}</h2>
            <div className="mt-2 grid gap-1.5 text-xs">
              <Link href="/subscription-terms" className="link inline-flex min-h-11 items-center justify-self-start">
                {t.footer.subscriptionTerms}
              </Link>
              <Link href="/withdrawal" className="link inline-flex min-h-11 items-center justify-self-start">
                {t.footer.withdrawal}
              </Link>
              <Link href="/contact" className="link inline-flex min-h-11 items-center justify-self-start">
                {t.help.contactCta}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
