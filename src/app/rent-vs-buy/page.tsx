import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import Methodology from "@/components/rent-vs-buy/Methodology";
import RentVsBuyApp from "@/components/rent-vs-buy/RentVsBuyApp";

export const metadata: Metadata = {
  title: "Rent vs Buy",
  description: "A simple and sensible calculator for comparing renting vs owning a home in Canada.",
};

export default function RentVsBuyPage() {
  return (
    <>
      <Header
        title="Is it better to rent or buy?"
        subtitle="A simple and sensible calculator for comparing renting vs owning a home."
        showHomeLink
      />
      <main>
        <RentVsBuyApp />
        <Methodology />
      </main>
      <Footer />
    </>
  );
}
