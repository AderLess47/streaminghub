import { ConfirmSubmitButton } from "@/components/confirm-submit-button";
import { FormStatus } from "@/components/form-status";
import { Alert, Badge, PageHeader } from "@/components/ui";
import { getI18n } from "@/i18n";
import { deleteFaqAction, saveFaqAction, saveSettingsAction } from "@/lib/actions/admin";
import { getAllFaqRows, getSetting } from "@/lib/content";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminContentPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  await requireAdmin();
  const { t } = await getI18n();
  const params = await searchParams;
  const faqItems = getAllFaqRows();

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader eyebrow={t.admin.nav.content} title={t.admin.content.title} description={t.admin.content.subtitle} />

      {params.ok ? <Alert tone="success">{params.ok === "faq" ? t.admin.content.saved : t.admin.content.saved}</Alert> : null}

      <form action={saveSettingsAction} className="card grid grid-cols-1 gap-3 p-5">
        <h2 className="text-sm font-semibold">{t.admin.content.announcement}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="announcement_de" className="field-label">
              {t.admin.content.announcementDe}
            </label>
            <textarea
              id="announcement_de"
              name="announcement_de"
              rows={3}
              defaultValue={getSetting("announcement_de")}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="announcement_en" className="field-label">
              {t.admin.content.announcementEn}
            </label>
            <textarea
              id="announcement_en"
              name="announcement_en"
              rows={3}
              defaultValue={getSetting("announcement_en")}
              className="field"
            />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label htmlFor="product_summary_de" className="field-label">
              {t.admin.content.productSummary} (DE)
            </label>
            <textarea
              id="product_summary_de"
              name="product_summary_de"
              rows={3}
              defaultValue={getSetting("product_summary_de")}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="product_summary_en" className="field-label">
              {t.admin.content.productSummary} (EN)
            </label>
            <textarea
              id="product_summary_en"
              name="product_summary_en"
              rows={3}
              defaultValue={getSetting("product_summary_en")}
              className="field"
            />
          </div>
        </div>
        <FormStatus label={t.ui.saving} />
        <button type="submit" className="btn btn-primary btn-sm justify-self-start">
          {t.ui.save}
        </button>
      </form>

      <div className="grid grid-cols-1 gap-3">
        <h2 className="text-sm font-semibold">
          {t.admin.content.faqTitle} <Badge tone="neutral">{faqItems.length}</Badge>
        </h2>

        {faqItems.map((item) => (
          <details key={item.id} className="card px-4 py-3">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-xs marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="truncate text-[0.82rem] text-slate-200">{item.question_de}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="chip">{item.category}</span>
                <Badge tone={item.published ? "ok" : "warn"}>{item.published ? "live" : "draft"}</Badge>
              </span>
            </summary>
            <form action={saveFaqAction} className="mt-3 grid gap-3">
              <input type="hidden" name="faqId" value={item.id} />
              <div className="grid gap-3 md:grid-cols-[1fr_10rem_6rem]">
                <div>
                  <label className="field-label" htmlFor={`cat-${item.id}`}>
                    {t.admin.content.category}
                  </label>
                  <input id={`cat-${item.id}`} name="category" defaultValue={item.category} className="field" />
                </div>
                <div>
                  <label className="field-label" htmlFor={`sort-${item.id}`}>
                    {t.admin.content.sortOrder}
                  </label>
                  <input id={`sort-${item.id}`} name="sortOrder" type="number" defaultValue={item.sort_order} className="field" />
                </div>
                <label className="flex min-h-11 items-center gap-2 pb-2 text-xs text-muted">
                  <input type="checkbox" name="published" defaultChecked={Boolean(item.published)} className="size-4 accent-brand" />
                  {t.admin.content.published}
                </label>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="field-label" htmlFor={`qde-${item.id}`}>
                    {t.admin.content.questionDe}
                  </label>
                  <input id={`qde-${item.id}`} name="questionDe" defaultValue={item.question_de} className="field" />
                </div>
                <div>
                  <label className="field-label" htmlFor={`qen-${item.id}`}>
                    {t.admin.content.questionEn}
                  </label>
                  <input id={`qen-${item.id}`} name="questionEn" defaultValue={item.question_en} className="field" />
                </div>
                <div>
                  <label className="field-label" htmlFor={`ade-${item.id}`}>
                    {t.admin.content.answerDe}
                  </label>
                  <textarea id={`ade-${item.id}`} name="answerDe" rows={4} defaultValue={item.answer_de} className="field" />
                </div>
                <div>
                  <label className="field-label" htmlFor={`aen-${item.id}`}>
                    {t.admin.content.answerEn}
                  </label>
                  <textarea id={`aen-${item.id}`} name="answerEn" rows={4} defaultValue={item.answer_en} className="field" />
                </div>
              </div>
              <div className="flex gap-2">
                <FormStatus label={t.ui.saving} />
                <button type="submit" className="btn btn-primary btn-sm">
                  {t.admin.content.update}
                </button>
              </div>
            </form>
            <form action={deleteFaqAction} className="mt-2">
              <input type="hidden" name="faqId" value={item.id} />
              <ConfirmSubmitButton message="FAQ-Eintrag wirklich löschen?">
                {t.admin.content.delete}
              </ConfirmSubmitButton>
            </form>
          </details>
        ))}
      </div>

      <form action={saveFaqAction} className="card grid grid-cols-1 gap-3 p-5">
        <h2 className="text-sm font-semibold">{t.admin.content.newEntry}</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_10rem_6rem]">
          <div>
            <label htmlFor="new-category" className="field-label">
              {t.admin.content.category}
            </label>
            <input id="new-category" name="category" defaultValue="account" className="field" />
          </div>
          <div>
            <label htmlFor="new-sort" className="field-label">
              {t.admin.content.sortOrder}
            </label>
            <input id="new-sort" name="sortOrder" type="number" defaultValue={faqItems.length} className="field" />
          </div>
          <label className="flex min-h-11 items-center gap-2 pb-2 text-xs text-muted">
            <input type="checkbox" name="published" className="size-4 accent-brand" />
            {t.admin.content.published}
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <input name="questionDe" placeholder={t.admin.content.questionDe} required className="field" aria-label={t.admin.content.questionDe} />
          <input name="questionEn" placeholder={t.admin.content.questionEn} className="field" aria-label={t.admin.content.questionEn} />
          <textarea name="answerDe" rows={3} placeholder={t.admin.content.answerDe} required className="field" aria-label={t.admin.content.answerDe} />
          <textarea name="answerEn" rows={3} placeholder={t.admin.content.answerEn} className="field" aria-label={t.admin.content.answerEn} />
        </div>
        <FormStatus label={t.ui.saving} />
        <button type="submit" className="btn btn-primary btn-sm justify-self-start">
          {t.admin.content.create}
        </button>
      </form>
    </div>
  );
}
