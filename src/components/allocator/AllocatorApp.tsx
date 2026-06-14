"use client";

import dynamic from "next/dynamic";

const Main = dynamic(() => import("./Main"), { ssr: false });

export default function AllocatorApp() {
  return <Main />;
}
