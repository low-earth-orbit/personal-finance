import type { MetadataRoute } from "next";
import { SITE_URL, TOOL_PATHS } from "@/utils/site";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", ...TOOL_PATHS].map((path) => ({
    // The hub's canonical is the bare origin, so list it without a trailing slash.
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.8,
  }));
}
