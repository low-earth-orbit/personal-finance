import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Source_Sans_3 } from "next/font/google";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import Providers from "./providers";
import { SITE_URL } from "@/utils/site";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  openGraph: { siteName: "Personal Finance", type: "website", locale: "en_CA" },
  // Hub canonical; every tool page sets its own.
  alternates: { canonical: "/" },
  title: {
    default: "Personal Finance: free calculators for Canadians",
    template: "%s | Personal Finance",
  },
  description:
    "Free, simple personal finance calculators for Canadians — compare renting vs buying, plan for retirement, and more.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const FAVICON =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text x="16" y="23" font-size="22" text-anchor="middle">%F0%9F%A4%91</text></svg>';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps} className={sourceSans.variable}>
      <head>
        <ColorSchemeScript
          defaultColorScheme="auto"
          localStorageKey="personal-finance-color-scheme"
        />
        <link rel="icon" type="image/svg+xml" href={FAVICON} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Personal Finance",
              url: SITE_URL,
            }),
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
