import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://dripmarkets.net"),
  title: "Osinko — Split the stock. Trade the dividend. Borrow on both.",
  description:
    "The Aave of stocks. Deposit your stock and get the dividend the day you earn it, a little every second, or as more stock. Borrow against your stock and let the dividends pay the interest. Split a stock and sell the dividend on its own. On Robinhood Chain.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Osinko — The Aave of stocks",
    description:
      "Get your dividends weeks early. Borrow against your stock and let the dividends pay the interest. Split a stock and sell the dividend on its own. On Robinhood Chain.",
    url: "https://dripmarkets.net",
    siteName: "Osinko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Osinko — The Aave of stocks",
    description: "Get your dividends weeks early. Borrow against your stock and let the dividends pay the interest. Sell the dividend on its own.",
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
