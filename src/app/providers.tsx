"use client";

import { MantineProvider, createTheme, localStorageColorSchemeManager } from "@mantine/core";
import type { ReactNode } from "react";
import DisclaimerGate from "@/components/shared/DisclaimerGate";

const theme = createTheme({
  primaryColor: "teal",
  fontFamily: "var(--font-lato), sans-serif",
  headings: { fontFamily: "var(--font-lato), sans-serif" },
});

const colorSchemeManager = localStorageColorSchemeManager({
  key: "personal-finance-color-scheme",
});

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme="auto"
      colorSchemeManager={colorSchemeManager}
    >
      {children}
      <DisclaimerGate />
    </MantineProvider>
  );
}
