import type { ReactNode } from "react";

import { DocsMobileNav, DocsSidebar } from "@/components/docs/navigation";

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 md:flex-row">
      <DocsSidebar />
      <div className="flex-1 space-y-6">
        <DocsMobileNav />
        {children}
      </div>
    </div>
  );
}
