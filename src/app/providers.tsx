"use client";

import { MantineProvider, localStorageColorSchemeManager } from "@mantine/core";
import type { ReactNode } from "react";
import DisclaimerGate from "@/components/shared/DisclaimerGate";
import { cssVariablesResolver, theme } from "./theme";

const colorSchemeManager = localStorageColorSchemeManager({
  key: "personal-finance-color-scheme",
});

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="auto"
      colorSchemeManager={colorSchemeManager}
    >
      {children}
      <DisclaimerGate />
    </MantineProvider>
  );
}
