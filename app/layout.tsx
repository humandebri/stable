import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

const APP_TITLE = "3009 Facilitated Payments";
const APP_DESCRIPTION =
  "Create and manage deferred ERC-3009 transfer authorizations with WalletConnect login.";

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
