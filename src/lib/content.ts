import type { Locale } from "@/i18n/config";
import { all, get } from "./db";

export type FaqItem = {
  id: string;
  category: string;
  question: string;
  answer: string;
  published: boolean;
  sortOrder: number;
};

type FaqRow = {
  id: string;
  category: string;
  sort_order: number;
  question_de: string;
  answer_de: string;
  question_en: string;
  answer_en: string;
  published: number;
};

const usesEnglish = (locale: Locale) => locale !== "de";

export function getFaqItems(locale: Locale, options?: { category?: string; limit?: number }) {
  const rows = all<FaqRow>(
    `SELECT id, category, sort_order, question_de, answer_de, question_en, answer_en, published
     FROM faq_items
     WHERE published = 1 ${options?.category ? "AND category = ?" : ""}
     ORDER BY sort_order ASC, updated_at DESC
     ${options?.limit ? "LIMIT ?" : ""}`,
    ...(options?.category ? [options.category] : []),
    ...(options?.limit ? [options.limit] : []),
  );

  return rows.map<FaqItem>((row) => ({
    id: row.id,
    category: row.category,
    question: usesEnglish(locale) ? row.question_en : row.question_de,
    answer: usesEnglish(locale) ? row.answer_en : row.answer_de,
    published: Boolean(row.published),
    sortOrder: row.sort_order,
  }));
}

export function getAllFaqRows() {
  return all<FaqRow>(
    `SELECT id, category, sort_order, question_de, answer_de, question_en, answer_en, published
     FROM faq_items ORDER BY sort_order ASC`,
  );
}

export function getSetting(key: string, fallback = "") {
  return get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, key)?.value ?? fallback;
}

export function getAnnouncement(locale: Locale) {
  return getSetting(usesEnglish(locale) ? "announcement_en" : "announcement_de", "");
}
