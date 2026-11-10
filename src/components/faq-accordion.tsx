import type { FaqItem } from "@/lib/content";

export function FaqAccordion({ items }: { items: FaqItem[] }) {
  return (
    <div className="grid gap-2.5">
      {items.map((item) => (
        <details
          key={item.id}
          className="group card overflow-hidden px-5 py-4 transition-colors open:border-brand/35"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[0.95rem] font-medium text-fg marker:hidden [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span>
            <span
              aria-hidden="true"
              className="grid size-6 shrink-0 place-items-center rounded-full border border-line text-muted transition-transform group-open:rotate-45 group-open:border-cyan/50 group-open:text-cyan"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </summary>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}
