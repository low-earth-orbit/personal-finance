import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import GlidePathApp from "@/components/glide-path/GlidePathApp";
import Methodology from "@/components/glide-path/Methodology";

export const metadata: Metadata = {
  title: "Lifetime Allocation (Glide Path)",
  description: "Find your optimal stock allocation across your lifetime.",
};

export default function GlidePathPage() {
  return (
    <>
      <Header
        title="Lifetime Allocation (Glide Path)"
        subtitle="Find your optimal stock allocation across your lifetime."
        showHomeLink
      />
      <main>
        <GlidePathApp />
        <Methodology />
      </main>
      <Footer />
    </>
  );
}
