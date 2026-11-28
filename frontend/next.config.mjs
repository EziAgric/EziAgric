/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";
const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

// Next.js App Router emits inline bootstrap scripts and styles, so 'unsafe-inline'
// stays until a nonce-based policy is added via middleware (shortcut: no nonces, upgrade to nonce CSP).
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  ["connect-src 'self'", apiOrigin, isDev ? "ws: wss:" : ""].filter(Boolean).join(" "),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig = {
  // Emit a self-contained server bundle for the slim Docker runtime stage.
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: contentSecurityPolicy }],
      },
    ];
  },
};

export default nextConfig;
