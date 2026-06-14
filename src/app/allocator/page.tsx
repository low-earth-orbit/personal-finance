import type { Metadata } from "next";
import AllocatorApp from "@/components/allocator/AllocatorApp";
import TaxAssumptions from "@/components/allocator/TaxAssumptions";
import Footer from "@/components/shared/Footer";
import Header from "@/components/shared/Header";

export const metadata: Metadata = {
  title: "Where to invest: TFSA, RRSP or Non-Reg?",
  description:
    "Split a lump sum across TFSA, RRSP, and non-registered the tax-smart way.",
};

export default function AllocatorPage() {
  return (
    <>
      <Header
        title="Where to invest: TFSA, RRSP or Non-Reg?"
        subtitle="Split a lump sum across TFSA, RRSP, and non-registered the tax-smart way."
        showHomeLink
      />
      <main>
        <AllocatorApp />
        <TaxAssumptions />
      </main>
      <Footer />
    </>
  );
}
