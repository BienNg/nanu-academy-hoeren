import { Suspense, type ReactNode } from "react";
import { BottomNav, BottomNavFallback } from "./BottomNav";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-surface text-on-surface antialiased selection:bg-primary-fixed">
      <div className="relative flex w-full flex-1 flex-col bg-surface pb-24">
        <div className="mx-auto flex w-full flex-1 flex-col md:max-w-[680px]">
          {children}
        </div>
      </div>
      <Suspense fallback={<BottomNavFallback />}>
        <BottomNav />
      </Suspense>
    </div>
  );
}
