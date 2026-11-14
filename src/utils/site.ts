/** Production origin, used for canonical URLs, the sitemap and robots.txt. */
export const SITE_URL = "https://personal-finance-tools.leohong.dev";

/** Tool routes listed in the sitemap (the hub at "/" is added separately). */
export const TOOL_PATHS = [
  "/rent-vs-buy",
  "/retirement",
  "/glide-path",
  "/acb",
  "/allocator",
  "/swr",
  "/expected-return",
] as const;
