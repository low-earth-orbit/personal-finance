import type { Metadata } from "next";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import GlidePathApp from "@/components/glide-path/GlidePathApp";
import Methodology from "@/components/glide-path/Methodology";

export const metadata: Metadata = {
  title: "Lifetime Allocation",
  description: "A research model of how stock allocation could change over a lifetime.",
};

export default function GlidePathPage() {
  return (
    <>
      <Header
        title="Lifetime Allocation"
        subtitle="A research model of how stock allocation could change over a lifetime."
        showHomeLink
        eyebrow="03 / Lifetime Allocation"
        status="new"
        tags={["Research model", "CRRA utility"]}
      />
      <main>
        <GlidePathApp />
        <Methodology />
      </main>
      <Footer />
    </>
  );
}
