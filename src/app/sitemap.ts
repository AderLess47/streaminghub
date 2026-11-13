import type { MetadataRoute } from "next";

const BASE = process.env.APP_URL ?? "https://streaminghub.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const publicRoutes: { path: string; priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/premium", priority: 0.9, changeFrequency: "monthly" },
    { path: "/download", priority: 0.9, changeFrequency: "weekly" },
    { path: "/activate", priority: 0.5, changeFrequency: "monthly" },
    { path: "/help", priority: 0.7, changeFrequency: "monthly" },
    { path: "/faq", priority: 0.7, changeFrequency: "monthly" },
    { path: "/contact", priority: 0.6, changeFrequency: "yearly" },
    { path: "/status", priority: 0.5, changeFrequency: "weekly" },
    { path: "/docs/api", priority: 0.4, changeFrequency: "monthly" },
    { path: "/imprint", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/account-deletion", priority: 0.4, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/subscription-terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/withdrawal", priority: 0.3, changeFrequency: "yearly" },
    { path: "/widerruf", priority: 0.4, changeFrequency: "yearly" },
    { path: "/kuendigung", priority: 0.4, changeFrequency: "yearly" },
    { path: "/barrierefreiheit", priority: 0.3, changeFrequency: "yearly" },
  ];

  return publicRoutes.map((route) => ({
    url: `${BASE}${route.path}`,
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
