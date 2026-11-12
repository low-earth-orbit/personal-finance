import type { NextConfig } from "next";

// The app is served from the root of its domain (personal-finance-tools.leohong.dev),
// so no basePath or assetPrefix is needed.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1"],
  reactCompiler: true,
  experimental: {
    // Turbopack's on-disk dev cache has twice left `next dev` unusable here (runaway worker
    // processes, then a `next/font/google` resolve error). Cold starts take ~2s without it, so
    // trade the cache for a dev server that can't wedge on stale state.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
