import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import MethodologyDoc from "@/components/glide-path/MethodologyDoc";

export const metadata: Metadata = {
  title: "Glide Path — Methodology & Research",
  description:
    "Full methodology and research note for the Lifetime Allocation Optimizer: CRRA utility, coordinate ascent, the bond menu, and the iid vs forward-block scenarios.",
};

// Read the markdown source at build time (static export). The doc is the single source of
// truth; this page renders it. Relative file paths in the doc (../../src/...) point at the
// repo and don't resolve on the web — that's expected for a rendered research note.
function loadMethodology(): string {
  const file = path.join(process.cwd(), "docs", "glide-path", "methodology.md");
  return fs.readFileSync(file, "utf8");
}

export default function GlidePathMethodologyPage() {
  const source = loadMethodology();
  return (
    <>
      <Header
        title="Methodology & Research"
        subtitle="Lifetime Allocation Optimizer — the full analysis note."
        showHomeLink
      />
      <main>
        <MethodologyDoc source={source} />
      </main>
      <Footer />
    </>
  );
}
