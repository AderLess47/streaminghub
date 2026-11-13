import Link from "next/link";
import { Icon } from "@/components/icons";
import { ScrollRegion } from "@/components/scroll-region";
import { Alert, Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { setContractRequestHandledAction } from "@/lib/actions/admin";
import {
  contractRequestStats,
  listContractRequests,
  type ContractRequest,
  type ContractRequestKind,
} from "@/lib/contract-requests";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

type Filter = {
  kind?: ContractRequestKind;
  state?: "open" | "handled";
};

function parseFilter(kindRaw?: string, stateRaw?: string): Filter {
  const kind =
    kindRaw === "withdrawal" || kindRaw === "cancellation" ? kindRaw : undefined;
  const state = stateRaw === "open" || stateRaw === "handled" ? stateRaw : undefined;
  return { kind, state };
}

function href(filter: Filter, next: Partial<Filter>): string {
  const merged = { ...filter, ...next };
  const params = new URLSearchParams();
  if (merged.kind) params.set("kind", merged.kind);
  if (merged.state) params.set("state", merged.state);
  const query = params.toString();
  return query ? `/admin/contracts?${query}` : "/admin/contracts";
}

export default async function AdminContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; state?: string; ok?: string }>;
}) {
  await requireStaff();
  const { kind, state, ok } = await searchParams;
  const { t, locale } = await getI18n();
  const de = locale !== "en";

  const filter = parseFilter(kind, state);
  const rows = listContractRequests({ ...filter, limit: 200 });
  const stats = contractRequestStats();

  const dateFormat = new Intl.DateTimeFormat(de ? "de-DE" : "en-GB", {
    dateStyle: "short",
    timeStyle: "short",
  });

  const outcome = (row: ContractRequest): string => {
    switch (row.status) {
      case "canceled_web":
        return de ? "Gekündigt, endet zum Periodenende" : "Cancelled, ends at period end";
      case "store_channel":
        return de ? "Store-Abo, dort zu kündigen" : "Store subscription, cancel there";
      case "no_subscription":
        return de ? "Kein laufendes Abo" : "No running subscription";
      case "no_account":
        return de ? "Kein Konto gefunden" : "No account found";
      case "failed":
        return de ? "Zahlungsanbieter hat abgelehnt" : "Payment provider refused";
      default:
        return de ? "Eingegangen" : "Received";
    }
  };

  const kindLabel = (value: string): string =>
    value === "cancellation" ? t.admin.contracts.cancellation : t.admin.contracts.withdrawal;

  const kindFilters: { label: string; next: Partial<Filter> }[] = [
    { label: t.admin.contracts.filterAll, next: { kind: undefined } },
    { label: t.admin.contracts.withdrawal, next: { kind: "withdrawal" } },
    { label: t.admin.contracts.cancellation, next: { kind: "cancellation" } },
  ];
  const stateFilters: { label: string; next: Partial<Filter> }[] = [
    { label: t.admin.contracts.filterAll, next: { state: undefined } },
    { label: t.admin.contracts.filterOpen, next: { state: "open" } },
    { label: t.admin.contracts.filterHandled, next: { state: "handled" } },
  ];

  return (
    <div className="grid gap-5">
      <PageHeader
        eyebrow={t.admin.nav.contracts}
        title={t.admin.contracts.title}
        description={t.admin.contracts.subtitle}
      />

      {ok === "handled" ? (
        <Alert tone="success" id="contracts-ok" autoFocus>
          {t.admin.contracts.handledNotice}
        </Alert>
      ) : null}
      {ok === "reopened" ? (
        <Alert tone="info" id="contracts-ok" autoFocus>
          {t.admin.contracts.reopenedNotice}
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted">
            {t.admin.contracts.openSummary}
          </p>
          <p className="mt-1 text-2xl font-semibold">{stats.open}</p>
        </div>
        <div className="card p-4">
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted">
            {t.admin.contracts.withdrawals}
          </p>
          <p className="mt-1 text-2xl font-semibold">{stats.openWithdrawals}</p>
        </div>
        <div className="card p-4">
          <p className="text-[0.68rem] uppercase tracking-[0.12em] text-muted">
            {t.admin.contracts.cancellations}
          </p>
          <p className="mt-1 text-2xl font-semibold">{stats.openCancellations}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {kindFilters.map((entry) => {
          const active = (filter.kind ?? undefined) === (entry.next.kind ?? undefined);
          return (
            <Link
              key={`kind-${entry.label}`}
              href={href(filter, entry.next)}
              className={`btn btn-sm ${active ? "btn-primary" : "btn-ghost"}`}
              aria-current={active ? "page" : undefined}
            >
              {entry.label}
            </Link>
          );
        })}
        <span className="mx-1 hidden h-5 w-px bg-line/60 sm:block" aria-hidden="true" />
        {stateFilters.map((entry) => {
          const active = (filter.state ?? undefined) === (entry.next.state ?? undefined);
          return (
            <Link
              key={`state-${entry.label}`}
              href={href(filter, entry.next)}
              className={`btn btn-sm ${active ? "btn-primary" : "btn-ghost"}`}
              aria-current={active ? "page" : undefined}
            >
              {entry.label}
            </Link>
          );
        })}
      </div>

      <ScrollRegion label={t.admin.contracts.title} className="card overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">{t.admin.contracts.title}</caption>
          <thead>
            <tr>
              <th>{t.admin.contracts.received}</th>
              <th>{t.admin.contracts.kind}</th>
              <th>{t.admin.contracts.customer}</th>
              <th>{t.admin.contracts.contract}</th>
              <th>{t.admin.contracts.outcome}</th>
              <th>{t.admin.contracts.processing}</th>
              <th>{t.admin.contracts.markHandled}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const returnTo = href(filter, {});
              return (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-xs">
                    {dateFormat.format(new Date(row.createdAt))}
                    <p className="text-[0.68rem] text-muted">{row.reference}</p>
                  </td>
                  <td>
                    <Badge tone={row.kind === "withdrawal" ? "brand" : "neutral"}>
                      {kindLabel(row.kind)}
                    </Badge>
                  </td>
                  <td className="text-xs">
                    <span className="block">{row.name || "–"}</span>
                    <span className="text-muted">{row.email}</span>
                  </td>
                  <td className="text-xs">
                    {row.contract}
                    {row.note ? (
                      <p className="mt-1 max-w-[16rem] text-[0.68rem] text-muted">{row.note}</p>
                    ) : null}
                  </td>
                  <td className="text-xs">{outcome(row)}</td>
                  <td className="text-xs">
                    {row.handledAt ? (
                      <>
                        <Badge tone="ok">{t.admin.contracts.handled}</Badge>
                        <p className="mt-1 text-[0.68rem] text-muted">
                          {dateFormat.format(new Date(row.handledAt))}
                          {row.handledBy ? ` · ${row.handledBy}` : ""}
                        </p>
                      </>
                    ) : (
                      <Badge tone="warn">{t.admin.contracts.open}</Badge>
                    )}
                  </td>
                  <td>
                    <form action={setContractRequestHandledAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <input type="hidden" name="handled" value={row.handledAt ? "0" : "1"} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button type="submit" className="btn btn-ghost btn-sm whitespace-nowrap">
                        <Icon name={row.handledAt ? "refresh" : "check"} size={14} />
                        {row.handledAt ? t.admin.contracts.reopen : t.admin.contracts.markHandled}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-xs text-muted">
                  {t.admin.contracts.empty}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}
