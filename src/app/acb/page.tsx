import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import AcbApp from "@/components/acb/AcbApp";

export const metadata: Metadata = {
  alternates: { canonical: "/acb" },
  title: "ACB Calculator",
  description:
    "Calculate the adjusted cost basis of your non-registered holdings from a Wealthsimple activity export.",
};

export default function AcbPage() {
  return (
    <>
      <Header
        title="ACB Calculator"
        subtitle="Upload a Wealthsimple, Questrade or IBKR activity file to compute the adjusted cost basis of your non-registered holdings."
        showHomeLink
        eyebrow="04 / ACB"
        status="preview"
        tags={["Wealthsimple · Questrade · IBKR", "Parsed in your browser"]}
      />
      <main>
        <AcbApp />
      </main>
      <Footer />
    </>
  );
}
