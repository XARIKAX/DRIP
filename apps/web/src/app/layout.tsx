import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.osinko.app"),
  title: "Osinko — The on-chain dividend engine",
  description:
    "The Aave of stocks. Deposit your stock and get the dividend the day you earn it, a little every second, or as more stock. Borrow against your stock and let the dividends pay the interest. Split a stock and sell the dividend on its own. On Robinhood Chain.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Osinko — The on-chain dividend engine",
    description:
      "Get your dividends weeks early. Borrow against your stock and let the dividends pay the interest. Split a stock and sell the dividend on its own. On Robinhood Chain.",
    url: "https://www.osinko.app",
    siteName: "Osinko",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Osinko — The on-chain dividend engine",
    description: "Get your dividends weeks early. Borrow against your stock and let the dividends pay the interest. Sell the dividend on its own.",
  },
};

/**
 * The browser chrome matches the top of the page, which is a lavender dawn — the old
 * value here was black, left over from an identity two rebrands ago, and made every
 * tab open on a colour the site never shows.
 */
export const viewport: Viewport = {
  themeColor: "#F6F4FB",
  colorScheme: "light",
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
