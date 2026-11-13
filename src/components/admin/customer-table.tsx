"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { ScrollRegion } from "@/components/scroll-region";
import { Badge } from "@/components/ui";
import type { Dictionary } from "@/i18n/de";
import {
  resetCustomerMfaAction,
  searchCustomersAction,
  toggleCustomerDisabledAction,
  updateCustomerRoleAction,
} from "@/lib/actions/admin";

export type CustomerRow = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  verified: boolean;
  devices: number;
  subscriptionStatus: string;
  created: string;
  disabled: boolean;
};

export function CustomerTable({
  rows,
  dictionary,
  initialQuery,
  total,
}: {
  rows: CustomerRow[];
  dictionary: Dictionary;
  initialQuery: string;
  /** Gesamtzahl der Konten; ist sie größer als die geladene Liste, sucht der Server mit. */
  total: number;
}) {
  const truncated = total > rows.length;
  const t = dictionary;
  const [query, setQuery] = useState(initialQuery);
  const [remote, setRemote] = useState<CustomerRow[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const needle = query.trim().toLowerCase();

  // Reicht die geladene Liste nicht aus (mehr Konten in der Datenbank), fragt der
  // Server nach den übrigen Treffern – entprellt, damit nicht jeder Tastendruck zählt.
  useEffect(() => {
    if (!truncated || needle.length < 2) {
      setRemote([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setRemote([]);
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchCustomersAction(needle);
        if (!cancelled) setRemote(found);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needle, truncated]);

  const visible = useMemo(() => {
    if (!needle) return rows;
    const local = rows.filter(
      (row) =>
        row.email.toLowerCase().includes(needle) || row.displayName.toLowerCase().includes(needle),
    );
    if (!truncated) return local;
    const seen = new Set(local.map((row) => row.id));
    return [...local, ...remote.filter((row) => !seen.has(row.id))];
  }, [rows, needle, remote, truncated]);

  // Der Filter steht in der Adresse, damit ein Neuladen ihn behält – ohne Navigation.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (needle) url.searchParams.set("q", needle);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }, [needle]);

  const summary = needle
    ? t.ui.resultsFor.replace("{count}", String(visible.length)).replace("{query}", query.trim())
    : truncated
      ? t.ui.resultsOfTotal.replace("{count}", String(rows.length)).replace("{total}", String(total))
      : t.ui.resultsAll.replace("{count}", String(rows.length));

  return (
    <>
      <form
        role="search"
        aria-label={t.admin.customers.search}
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => event.preventDefault()}
      >
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t.admin.customers.search}
          className="field max-w-sm"
          aria-label={t.admin.customers.search}
          aria-describedby="customers-result-summary"
        />
        {needle ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            {t.admin.customers.clearFilter}
          </button>
        ) : null}
      </form>

      <p id="customers-result-summary" role="status" className="text-[0.7rem] text-muted">
        {searching ? `${summary} · ${t.ui.loading}` : summary}
      </p>

      <ScrollRegion
        label={t.admin.customers.title}
        describedBy="customers-result-summary"
        className="card hidden overflow-x-auto xl:block"
      >
        <table className="data-table">
          <caption className="sr-only">{t.admin.customers.title}</caption>
          <thead>
            <tr>
              <th>{t.admin.customers.email}</th>
              <th>{t.admin.customers.role}</th>
              <th>{t.admin.customers.verified}</th>
              <th>{t.admin.customers.devices}</th>
              <th>{t.admin.customers.subscription}</th>
              <th>{t.admin.customers.created}</th>
              <th>{t.ui.actions}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link
                    href={`/admin/customers/${row.id}`}
                    className="link inline-flex min-h-9 items-center text-[0.82rem]"
                  >
                    {row.email}
                  </Link>
                  <p className="text-[0.68rem] text-muted">
                    {row.displayName || "—"}
                    {row.disabled ? " · deaktiviert" : ""}
                  </p>
                </td>
                <td>
                  <form action={updateCustomerRoleAction} className="flex items-center gap-1.5">
                    <input type="hidden" name="userId" value={row.id} />
                    <input type="hidden" name="returnTo" value="/admin/customers" />
                    <select
                      name="role"
                      defaultValue={row.role}
                      className="field !w-auto !py-1 !text-xs"
                      aria-label={`${t.admin.customers.role}: ${row.email}`}
                    >
                      <option value="customer">customer</option>
                      <option value="support">support</option>
                      <option value="admin">admin</option>
                    </select>
                    <button type="submit" className="btn btn-ghost btn-sm !min-w-11 !px-2" title={t.ui.save}>
                      <Icon name="check" size={13} />
                    </button>
                  </form>
                </td>
                <td>{row.verified ? <Badge tone="ok">✓</Badge> : <Badge tone="warn">—</Badge>}</td>
                <td>{row.devices}</td>
                <td>
                  <Badge tone={row.subscriptionStatus === "active" ? "ok" : "neutral"}>
                    {row.subscriptionStatus}
                  </Badge>
                </td>
                <td className="whitespace-nowrap text-xs">{row.created}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <form action={toggleCustomerDisabledAction}>
                      <input type="hidden" name="userId" value={row.id} />
                      <input type="hidden" name="disable" value={row.disabled ? "0" : "1"} />
                      <input type="hidden" name="returnTo" value="/admin/customers" />
                      <button
                        type="submit"
                        className="btn btn-ghost btn-sm !min-w-11 !px-2"
                        title={row.disabled ? t.admin.customers.enable : t.admin.customers.disable}
                      >
                        <Icon name={row.disabled ? "check" : "close"} size={13} />
                      </button>
                    </form>
                    <form action={resetCustomerMfaAction}>
                      <input type="hidden" name="userId" value={row.id} />
                      <input type="hidden" name="returnTo" value="/admin/customers" />
                      <button
                        type="submit"
                        className="btn btn-ghost btn-sm !min-w-11 !px-2"
                        title={t.admin.customers.resetMfa}
                      >
                        <Icon name="shield" size={13} />
                      </button>
                    </form>
                    <Link
                      href={`/admin/customers/${row.id}`}
                      className="btn btn-ghost btn-sm !min-w-11 !px-2"
                      title={t.ui.details}
                    >
                      <Icon name="arrow-right" size={13} />
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-xs text-muted">
                  {t.ui.noResults}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </ScrollRegion>

      {/* Bis 1280px passt die Tabelle nicht in den Inhaltsbereich; dort stehen die Konten als Karten. */}
      <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
        {visible.map((row) => (
          <li key={row.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/admin/customers/${row.id}`}
                  className="link inline-flex min-h-9 max-w-full items-center text-[0.82rem]"
                >
                  <span className="truncate">{row.email}</span>
                </Link>
                <p className="truncate text-[0.68rem] text-muted">
                  {row.displayName || "—"}
                  {row.disabled ? " · deaktiviert" : ""}
                </p>
              </div>
              <span className="shrink-0">
                <Badge tone={row.subscriptionStatus === "active" ? "ok" : "neutral"}>
                  {row.subscriptionStatus}
                </Badge>
              </span>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted">{t.admin.customers.devices}</dt>
                <dd>{row.devices}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.admin.customers.verified}</dt>
                <dd>{row.verified ? <Badge tone="ok">✓</Badge> : <Badge tone="warn">—</Badge>}</dd>
              </div>
              <div>
                <dt className="text-muted">{t.admin.customers.created}</dt>
                <dd className="whitespace-nowrap">{row.created}</dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <form action={updateCustomerRoleAction} className="flex items-center gap-1.5">
                <input type="hidden" name="userId" value={row.id} />
                <input type="hidden" name="returnTo" value="/admin/customers" />
                <select
                  name="role"
                  defaultValue={row.role}
                  className="field min-h-11 !w-auto !text-xs"
                  aria-label={`${t.admin.customers.role}: ${row.email}`}
                >
                  <option value="customer">customer</option>
                  <option value="support">support</option>
                  <option value="admin">admin</option>
                </select>
                <button type="submit" className="btn btn-ghost btn-sm !min-w-11 !px-2" title={t.ui.save}>
                  <Icon name="check" size={13} />
                </button>
              </form>

              <div className="flex items-center gap-1">
                <form action={toggleCustomerDisabledAction}>
                  <input type="hidden" name="userId" value={row.id} />
                  <input type="hidden" name="disable" value={row.disabled ? "0" : "1"} />
                  <input type="hidden" name="returnTo" value="/admin/customers" />
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm !min-w-11 !px-2"
                    title={row.disabled ? t.admin.customers.enable : t.admin.customers.disable}
                  >
                    <Icon name={row.disabled ? "check" : "close"} size={13} />
                  </button>
                </form>
                <form action={resetCustomerMfaAction}>
                  <input type="hidden" name="userId" value={row.id} />
                  <input type="hidden" name="returnTo" value="/admin/customers" />
                  <button
                    type="submit"
                    className="btn btn-ghost btn-sm !min-w-11 !px-2"
                    title={t.admin.customers.resetMfa}
                  >
                    <Icon name="shield" size={13} />
                  </button>
                </form>
                <Link
                  href={`/admin/customers/${row.id}`}
                  className="btn btn-ghost btn-sm !min-w-11 !px-2"
                  title={t.ui.details}
                >
                  <Icon name="arrow-right" size={13} />
                </Link>
              </div>
            </div>
          </li>
        ))}
        {visible.length === 0 ? (
          <li className="card p-6 text-center text-xs text-muted">{t.ui.noResults}</li>
        ) : null}
      </ul>
    </>
  );
}
