import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  serverExternalPackages: ["node:sqlite"],
  // Dev-only: the cloud preview host proxies to this server. Exact hostname,
  // never a wildcard. Production does not use the dev server.
  allowedDevOrigins: ["pv-93f06bd5e4c5-592c78a8-9dae-4adf-b586-69836b8a1c1e.style.dev"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.streaminghub.org" }],
        destination: "https://streaminghub.org/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
