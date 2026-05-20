import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CardIt — Find your best credit card",
  description:
    "A personal, transparent credit-card recommender for India. Tell it what you spend; it tells you what to carry.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
