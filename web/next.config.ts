import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Explicit workspace policy: compile TS, but never run the type checker.
  // Next 16 removed build-time linting; do not add a lint hook to these scripts.
  typescript: { ignoreBuildErrors: true },
  async headers() {
    const headers = [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'Vary', value: 'Cookie' },
    ];
    return ['/', '/:path*'].map((source) => ({ source, headers }));
  },
};

export default nextConfig;
