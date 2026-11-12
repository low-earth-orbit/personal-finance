import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Sans } from "next/font/google";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import Providers from "./providers";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-plex-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Personal Finance",
    template: "%s",
  },
  description:
    "Free, simple personal finance calculators for Canadians — compare renting vs buying, plan for retirement, and more.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const FAVICON =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="%2314181f"/><path d="M8 10h11M8 16h16M8 22h16" stroke="%23ffffff" stroke-width="2.5" stroke-linecap="round"/><circle cx="24" cy="10" r="2.5" fill="%234a9a80"/></svg>';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps} className={plexSans.variable}>
      <head>
        <ColorSchemeScript
          defaultColorScheme="auto"
          localStorageKey="personal-finance-color-scheme"
        />
        <link rel="icon" type="image/svg+xml" href={FAVICON} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
