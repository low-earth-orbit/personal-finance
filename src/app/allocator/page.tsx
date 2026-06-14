import type { Metadata } from "next";
import AllocatorApp from "@/components/allocator/AllocatorApp";
import TaxAssumptions from "@/components/allocator/TaxAssumptions";
import Footer from "@/components/shared/Footer";
import Header from "@/components/shared/Header";

export const metadata: Metadata = {
  title: "Lump-sum Allocation Optimizer",
  description:
    "Optimize a lump-sum allocation across TFSA, RRSP, and non-registered investments.",
};

export default function AllocatorPage() {
  return (
    <>
      <Header
        title="How should I invest this lump sum?"
        subtitle="Optimize the split across TFSA, RRSP, and non-registered investments, including when to claim RRSP deductions."
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
