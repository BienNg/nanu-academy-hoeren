"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";
import { useVisitTracking } from "@/lib/useProgress";

function VisitTracking() {
  useVisitTracking();
  return null;
}

export function AuthSessionProvider({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider session={session}>
      <VisitTracking />
      {children}
    </SessionProvider>
  );
}
