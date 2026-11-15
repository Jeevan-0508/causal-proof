import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAUSAL//PROOF — Test why",
  description: "Evidence-constrained causal investigation and counterfactual simulation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
