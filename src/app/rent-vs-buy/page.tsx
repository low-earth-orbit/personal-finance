import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import Methodology from "@/components/rent-vs-buy/Methodology";
import RentVsBuyApp from "@/components/rent-vs-buy/RentVsBuyApp";

export const metadata: Metadata = {
  alternates: { canonical: "/rent-vs-buy" },
  title: "Rent vs Buy",
  description: "A simple and sensible calculator for comparing renting vs owning a home in Canada.",
};

export default function RentVsBuyPage() {
  return (
    <>
      <Header
        title="Is it better to rent or buy?"
        subtitle="Compare the 30-year net worth of renting against buying a home in Canada, including mortgage, closing costs, property tax and investment returns."
        showHomeLink
        eyebrow="01 / Rent vs Buy"
        tags={["Monte Carlo", "30-year horizon"]}
      />
      <main>
        <RentVsBuyApp />
        <Methodology />
      </main>
      <Footer />
    </>
  );
}
