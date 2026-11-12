import type { NextConfig } from "next";

// The app is served from the root of its domain (personal-finance-tools.leohong.dev),
// so no basePath or assetPrefix is needed.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1"],
  reactCompiler: true,
};

export default nextConfig;
