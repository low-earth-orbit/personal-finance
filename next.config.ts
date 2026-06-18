import type { NextConfig } from "next";

// GitHub Pages serves the app under /personal-finance; local dev and other builds run at the root.
// The deploy workflow sets GITHUB_PAGES=true so only that build gets the prefix.
const isGithubPages = process.env.NODE_ENV === "production" && process.env.GITHUB_PAGES === "true";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  allowedDevOrigins: ["127.0.0.1"],
  reactCompiler: true,
  ...(isGithubPages && {
    basePath: "/personal-finance",
    assetPrefix: "/personal-finance/",
  }),
};

export default nextConfig;
