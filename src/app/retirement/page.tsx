import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import Assumptions from "@/components/retirement/Assumptions";
import RetirementApp from "@/components/retirement/RetirementApp";

export const metadata: Metadata = {
  alternates: { canonical: "/retirement" },
  title: "When Can I Retire?",
  description:
    "A quick reality check on when you can retire in Canada — project your savings against your target income to find the earliest age your money lasts.",
};

export default function RetirementPage() {
  return (
    <>
      <Header
        title="When can I retire?"
        subtitle="Project your savings against your target income, using CPP, OAS and any workplace pension, to find the earliest age your money lasts."
        showHomeLink
        eyebrow="02 / Retirement"
        tags={["Monte Carlo", "Today's dollars", "CPP + OAS"]}
      />
      <main>
        <RetirementApp />
        <Assumptions />
      </main>
      <Footer />
    </>
  );
}
