import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://dripmarkets.net"),
  title: "Osinko — Hold the share. Stream the drip.",
  description:
    "The Aave of dividends. Stream stock dividends per second, take them early at the ex date, and borrow against your portfolio while the dividends pay the interest. On Robinhood Chain.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Osinko — The Aave of dividends",
    description:
      "Dividends streamed per second and advanced at the ex date. Credit against your stocks, serviced by the dividends themselves. Testnet build.",
    url: "https://dripmarkets.net",
    siteName: "Osinko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Osinko — The Aave of dividends",
    description: "Dividends streamed per second, advanced at the ex date, and credit your dividends repay.",
  },
};

/** The browser chrome matches the canvas, so the tab opens black rather than flashing white. */
export const viewport: Viewport = {
  themeColor: "#06080A",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
