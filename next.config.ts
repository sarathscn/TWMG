import type { NextConfig } from "next";

// Baseline browser protections for a finance app: no framing (clickjacking),
// no MIME sniffing, minimal referrer leakage and no powerful device APIs.
// Scripts, connections and frames are limited to this site and Supabase. The page's small inline scripts
// need 'unsafe-inline'; the fixed list of hosts still stops injected code from loading or sending data elsewhere.
const dev = process.env.NODE_ENV === "development";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${dev ? " ws://localhost:* http://localhost:* http://127.0.0.1:*" : ""}`,
  "frame-src 'none'", "worker-src 'self' blob:", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join("; ");
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
