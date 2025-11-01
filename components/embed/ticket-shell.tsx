"use client";

import type { ReactNode } from "react";

type TicketShellProps = {
  children: ReactNode;
};

export function TicketShell({ children }: TicketShellProps) {
  return (
    <div className="w-full overflow-hidden ">
          {children}
    </div>
  );
}
