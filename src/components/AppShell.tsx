import type { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-surface text-on-surface antialiased selection:bg-primary-fixed">
      <div className="relative flex w-full flex-1 flex-col bg-surface">
        <div className="mx-auto flex w-full flex-1 flex-col md:max-w-[680px]">
          {children}
        </div>
      </div>
    </div>
  );
}
