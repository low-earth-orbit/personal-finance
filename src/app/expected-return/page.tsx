import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import ExpectedReturnApp from "@/components/expected-return/ExpectedReturnApp";
import Notes from "@/components/expected-return/Notes";

export const metadata: Metadata = {
  title: "Expected stock returns",
  description:
    "Estimate the long-run expected return of a global stock portfolio from yields, growth, valuations and history.",
};

export default function ExpectedReturnPage() {
  return (
    <>
      <Header
        title="Expected stock returns"
        subtitle="What return should you plan on for a global stock portfolio?"
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
