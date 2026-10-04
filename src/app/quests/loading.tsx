import { BottomNav } from "@/components/BottomNav";

export default function QuestsLoading() {
  return (
    <div className="relative flex min-h-dvh w-full flex-1 flex-col bg-[#faf8ff]">
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 pt-3 pb-2.5">
          <div className="h-7 w-32 animate-pulse rounded-full bg-[#e2e7ff]" />
          <div className="h-7 w-28 animate-pulse rounded-full bg-[#e2e7ff]" />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 pt-4 pb-28">
        <div className="h-36 animate-pulse rounded-[24px] bg-[#ffb020]/25" />
        <div className="h-72 animate-pulse rounded-[24px] bg-white shadow-[0_4px_0_0_#e5e5ea]" />
        <div className="h-28 animate-pulse rounded-[24px] bg-white shadow-[0_4px_0_0_#e5e5ea]" />
      </main>
      <BottomNav />
    </div>
  );
}
