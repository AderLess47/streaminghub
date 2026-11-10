"use client";

import { useMemo, useState } from "react";
import type { HelpTopicKey } from "@/content/help";
import { Icon } from "./icons";

type Topic = {
  key: HelpTopicKey;
  title: string;
  description: string;
  intro: string;
  steps: string[];
  note: string;
};

export function HelpTopics({
  topics,
  labels,
}: {
  topics: Topic[];
  labels: { search: string; searchPlaceholder: string; noResults: string };
}) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalized) return topics;
    return topics.filter((topic) =>
      [topic.title, topic.description, topic.intro, ...topic.steps, topic.note]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [normalized, topics]);

  return (
    <div>
      <div className="relative max-w-xl">
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.search}
          className="field ps-11"
        />
      </div>

      <div className="mt-6 grid gap-3">
        {filtered.map((topic) => (
          <details key={topic.key} className="card group px-5 py-4" open={Boolean(normalized)}>
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 marker:hidden [&::-webkit-details-marker]:hidden">
              <div>
                <h3 className="text-[0.98rem] font-medium text-fg">{topic.title}</h3>
                <p className="mt-0.5 text-[0.8rem] text-muted">{topic.description}</p>
              </div>
              <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full border border-line text-muted transition-transform group-open:rotate-45 group-open:border-cyan/50 group-open:text-cyan">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            </summary>
            <div className="mt-4 border-t border-line/50 pt-4">
              <p className="text-sm leading-relaxed text-slate-300">{topic.intro}</p>
              <ol className="mt-3 grid gap-2">
                {topic.steps.map((step, index) => (
                  <li key={step} className="flex gap-2.5 text-[0.85rem] leading-relaxed text-muted">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line bg-white/5 text-[0.62rem] font-semibold text-cyan">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="mt-3 flex items-start gap-2 rounded-lg border border-line/60 bg-white/2 px-3 py-2 text-[0.72rem] leading-relaxed text-muted">
                <Icon name="info" size={13} className="mt-0.5 shrink-0 text-cyan" />
                {topic.note}
              </p>
            </div>
          </details>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-muted">{labels.noResults}</p>
      ) : null}
    </div>
  );
}
