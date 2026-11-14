import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import Notes from "@/components/swr/Notes";
import SwrApp from "@/components/swr/SwrApp";

export const metadata: Metadata = {
  alternates: { canonical: "/swr" },
  title: "Safe Withdrawal Rates",
  description:
    "Safe withdrawal rates by stock/bond mix and retirement length, from your own return, volatility and correlation assumptions.",
};

export default function SwrPage() {
  return (
    <>
      <Header
        title="Safe Withdrawal Rates"
        subtitle="How much can you withdraw each year, by stock/bond mix and retirement length? Built from your own return, volatility and correlation assumptions."
        showHomeLink
        eyebrow="06 / SWR"
        status="new"
        tags={["Monte Carlo", "Today's dollars", "Stocks + bonds"]}
      />
      <main>
        <SwrApp />
        <Notes />
      </main>
      <Footer />
    </>
  );
}
