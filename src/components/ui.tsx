import type { ReactNode } from "react";
import Link from "next/link";
import { Icon, type IconName } from "./icons";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "brand"
      ? "chip-brand"
      : tone === "ok"
        ? "chip-ok"
        : tone === "warn"
          ? "chip-warn"
          : tone === "danger"
            ? "chip-danger"
            : "";
  return <span className={`chip ${toneClass}`}>{children}</span>;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "start",
  id,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "start" | "center";
  id?: string;
}) {
  return (
    <div className={`max-w-3xl ${align === "center" ? "mx-auto text-center" : ""}`}>
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <h2 id={id} className="text-balance text-3xl font-semibold sm:text-[2.4rem] sm:leading-[1.1]">
        {title}
      </h2>
      {description ? (
        <p className="mt-4 text-[0.98rem] leading-relaxed text-muted sm:text-base">{description}</p>
      ) : null}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  icon,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title?: string;
  children?: ReactNode;
  icon?: IconName;
}) {
  const styles = {
    info: "border-sky-500/25 bg-sky-500/8 text-sky-100",
    success: "border-emerald-500/25 bg-emerald-500/8 text-emerald-100",
    warning: "border-amber-500/25 bg-amber-500/8 text-amber-100",
    danger: "border-rose-500/25 bg-rose-500/8 text-rose-100",
  }[tone];
  const iconName: IconName = icon ?? (tone === "success" ? "check" : tone === "danger" ? "alert" : tone === "warning" ? "alert" : "info");

  return (
    <div
      className={`flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed ${styles}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon name={iconName} size={18} className="mt-0.5 shrink-0 opacity-80" />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={title ? "mt-1 opacity-90" : "opacity-90"}>{children}</div> : null}
      </div>
    </div>
  );
}

export function StatusPill({
  status,
}: {
  status: "operational" | "degraded" | "down" | "not_configured";
}) {
  const map = {
    operational: { label: "Betriebsbereit", dot: "bg-emerald-400", text: "text-emerald-300" },
    degraded: { label: "Beeinträchtigt", dot: "bg-amber-400", text: "text-amber-300" },
    down: { label: "Nicht erreichbar", dot: "bg-rose-400", text: "text-rose-300" },
    not_configured: { label: "Nicht konfiguriert", dot: "bg-slate-400", text: "text-slate-300" },
  }[status];

  return (
    <span className={`inline-flex items-center gap-2 text-xs font-medium ${map.text}`}>
      <span className={`status-dot ${map.dot}`} />
      {map.label}
    </span>
  );
}

export function EmptyState({
  icon = "layers",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line/60 px-6 py-10 text-center">
      <span className="grid size-11 place-items-center rounded-full border border-line bg-white/4 text-cyan">
        <Icon name={icon} size={20} />
      </span>
      <p className="font-medium text-fg">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? (
        <Link href={action.href} className="btn btn-outline btn-sm mt-1">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/50 py-2.5 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-fg">{value}</span>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-line/40 pb-8">
      {eyebrow ? <p className="eyebrow mb-3">{eyebrow}</p> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
          {description ? <p className="mt-3 text-muted">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}
