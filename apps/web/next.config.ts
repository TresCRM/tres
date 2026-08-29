import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Emit .next/standalone so Dockerfile.web can copy a minimal runtime
  output: "standalone",
  // The monorepo lockfile lives at the repo root; Next 15 warns without this.
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Image optimization
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },

  // Security + performance headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Cache static assets aggressively
        source: "/(.*)\\.(ico|png|jpg|jpeg|svg|webp|avif|woff2?|ttf|eot)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        // Public pages can be cached at CDN edge
        source: "/(pricing|about|docs|careers|contact)",
        headers: [
          { key: "Cache-Control", value: "public, max-age=300, s-maxage=600, stale-while-revalidate=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
