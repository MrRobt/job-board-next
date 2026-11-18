import type { NextConfig } from "next";

const browserSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Avoid leaking a user's private job-search page via the Referer header.
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // TLS must also be enforced at the reverse proxy. No preload or
  // includeSubDomains without a separate approved domain audit.
  { key: "Strict-Transport-Security", value: "max-age=15552000" },
];

const noPrivateCache = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: browserSecurityHeaders },
      // Keep static fingerprinted Next assets cacheable; these only cover
      // user-specific or sensitive application routes and callback APIs.
      ...[
        "/account/:path*", "/admin/:path*", "/tracker/:path*",
        "/report/:path*", "/api/:path*", "/tools/:path*",
        "/pay/:path*", "/tool-pay/:path*", "/checkout/:path*",
        "/login", "/register",
      ].map(source => ({ source, headers: noPrivateCache })),
    ];
  },
};

export default config;
