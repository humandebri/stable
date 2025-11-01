"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/docs", label: "概要" },
  { href: "/docs/embed", label: "埋め込み" },
  { href: "/docs/facilitator", label: "ファシリテーター" },
  { href: "/whitepaper", label: "ホワイトペーパー" }
];

function clsx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function DocsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-24 hidden w-56 flex-col gap-3 text-sm text-muted-foreground md:flex">
      <span className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
        ドキュメント
      </span>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "rounded-md px-3 py-2 transition",
                active
                  ? "bg-muted text-foreground"
                  : "hover:bg-muted/70 hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function DocsMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="flex w-full overflow-x-auto text-xs text-muted-foreground md:hidden">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "whitespace-nowrap px-3 py-2",
              active ? "border-b-2 border-foreground text-foreground" : ""
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
