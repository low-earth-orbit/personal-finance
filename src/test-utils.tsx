import { render, type RenderOptions } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import type { ReactElement, ReactNode } from "react";
import { cssVariablesResolver, theme } from "@/app/theme";

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={cssVariablesResolver}>
      {children}
    </MantineProvider>
  );
}

// RTL render wrapped in MantineProvider so component tests have Mantine context.
export function renderWithMantine(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, { wrapper: Wrapper, ...options });
}

export * from "@testing-library/react";
