import type { Metadata } from "next";
import AllocatorApp from "@/components/allocator/AllocatorApp";
import TaxAssumptions from "@/components/allocator/TaxAssumptions";
import Footer from "@/components/shared/Footer";
import Header from "@/components/shared/Header";

export const metadata: Metadata = {
  alternates: { canonical: "/allocator" },
  title: "Where to Invest: TFSA, RRSP or Non-Reg?",
  description: "Explore a tax-aware split across TFSA, RRSP, and non-registered accounts.",
};

export default function AllocatorPage() {
  return (
    <>
      <Header
        title="Where to Invest: TFSA, RRSP or Non-Reg?"
        subtitle="Split one lump sum across TFSA, RRSP and non-registered accounts, using your available room and tax rates."
        showHomeLink
        eyebrow="05 / Allocator"
        status="preview"
        tags={["One lump sum, now", "BC · ON · NB"]}
      />
      <main>
        <AllocatorApp />
        <TaxAssumptions />
      </main>
      <Footer />
    </>
  );
}
