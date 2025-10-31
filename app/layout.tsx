import type { Metadata } from "next";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/navbar";

const APP_TITLE = "Paylancer";
const APP_DESCRIPTION =
  "Paylancer は、事前署名した ERC-3009 送金チケットを管理し、ファシリテーターが安全に実行できる dApp です。";

export const metadata: Metadata = {
  title: APP_TITLE,
  description: APP_DESCRIPTION
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <Providers>
          <Navbar />
          {children}
        </Providers>
      </body>
    </html>
  );
}
