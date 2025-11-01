"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";

const NAV_LINKS = [
  { href: "/jobs", label: "ユーザー" },
  { href: "/facilitator", label: "ファシリテーター" },
  { href: "/whitepaper", label: "ホワイトペーパー" },
  { href: "/docs/embed", label: "Docs" },
  { href: "/dev/api-keys", label: "Developer" }
];

export function Navbar() {
  const pathname = usePathname();

  if (pathname?.startsWith("/embed")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-4 text-sm font-medium">
          <Link href="/" className="text-foreground hover:text-foreground/80">
            Paylancer
          </Link>
          <nav className="flex items-center gap-2 text-xs text-muted-foreground">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false} />
        </div>
      </div>
    </header>
  );
}
