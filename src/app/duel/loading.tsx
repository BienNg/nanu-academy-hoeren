import { BottomNav } from "@/components/BottomNav";

export default function DuelLoading() {
  return (
    <div className="relative flex min-h-dvh w-full flex-1 flex-col bg-[#faf8ff]">
      <header className="sticky top-0 z-30 border-b border-black/[0.05] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl px-4 py-4 sm:px-6">
          <div className="h-7 w-24 animate-pulse rounded-full bg-[#e2e7ff]" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 pb-28 pt-4 sm:px-6">
        <div className="h-40 animate-pulse rounded-[28px] bg-[#0284c7]/20" />
        <div className="h-24 animate-pulse rounded-[28px] bg-white shadow-[0_4px_0_0_#dae2fd]" />
      </main>
      <BottomNav />
    </div>
  );
}
