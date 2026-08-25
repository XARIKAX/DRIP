import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Drip Markets — Dividends the way they should work",
  description:
    "The dividend layer for Robinhood Chain. Paid at the ex date, streamed per second, reinvested the moment it lands.",
  openGraph: {
    title: "Drip Markets — Get paid before Wall Street does",
    description:
      "Dividends advanced at the ex date, streamed per second, auto reinvested onchain. Testnet build.",
    type: "website",
  },
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
