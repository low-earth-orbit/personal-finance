import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import ExpectedReturnApp from "@/components/expected-return/ExpectedReturnApp";
import Notes from "@/components/expected-return/Notes";

export const metadata: Metadata = {
  alternates: { canonical: "/expected-return" },
  title: "Expected Stock Returns",
  description:
    "Estimate the long-run expected return of a global stock portfolio from yields, growth, valuations and history.",
};

export default function ExpectedReturnPage() {
  return (
    <>
      <Header
        title="Expected Stock Returns"
        subtitle="What return should you plan on for a global stock portfolio? Built from yields, earnings growth, valuations and history, after fund costs."
        showHomeLink
        eyebrow="07 / Expected return"
        status="preview"
        tags={["Real, compound", "Yields · CAPE · bonds · history", "VEQT-like mix"]}
      />
      <main>
        <ExpectedReturnApp />
        <Notes />
      </main>
      <Footer />
    </>
  );
}
