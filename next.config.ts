import type { NextConfig } from "next";

const securityHeaders = [
  // Browsers must always use HTTPS for this site.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // No other site can put AgentPulse in a frame (stops click-jacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The microphone is for voice notes, on this site's own pages only.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Client data must never be stored by browsers or in-between caches.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      // Client share pages: keep them out of search engines, caches, and other sites' referrer logs.
      {
        source: "/s/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
