import type { MetadataRoute } from "next";

const BASE = process.env.APP_URL ?? "https://streaminghub.org";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/admin", "/api/", "/reset-password", "/login", "/register"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
