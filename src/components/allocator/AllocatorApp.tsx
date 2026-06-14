"use client";

import dynamic from "next/dynamic";
import AppLoadingShell from "@/components/shared/AppLoadingShell";

const Main = dynamic(() => import("./Main"), {
  ssr: false,
  loading: () => <AppLoadingShell />,
});

export default function AllocatorApp() {
  return <Main />;
}
