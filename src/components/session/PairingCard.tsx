"use client";

import { useMemo, useState } from "react";
import type { PairingPairAttempt } from "@/lib/pairing";

type PairingItem = { id: string; vi: string; de: string };

type PairingCardProps = {
  items: PairingItem[];
  onSubmit: (answer: PairingPairAttempt[]) => void;
};

function MaterialIcon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={`material-symbols-outlined ${className ?? ""}`} aria-hidden="true">
      {name}
    </span>
  );
}

function shuffleOnce<T>(items: readonly T[]): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j] as T, next[i] as T];
  }
  return next;
}

function chipClass(pending: boolean, paired: boolean): string {
  if (paired) return "border-[#0066cc]/30 bg-[#0066cc]/10 text-[#0066cc]";
  if (pending) return "border-[#0066cc] bg-white text-[#0066cc]";
  return "border-black/[0.08] border-b-[3px] bg-white text-[#1d1d1f] hover:bg-[#f5f5f7]";
}

/**
 * Duolingo-style word pairing: tap one Vietnamese chip, then one German
 * chip (or the other order), to form a pair. Tap either chip of an existing
 * pair to undo it. Remount via parent `key` for each new card.
 */
export function PairingCard({ items, onSubmit }: PairingCardProps) {
  const viColumn = useMemo(() => shuffleOnce(items), [items]);
  const deColumn = useMemo(() => shuffleOnce(items), [items]);

  const [pairs, setPairs] = useState<PairingPairAttempt[]>([]);
  const [pendingVi, setPendingVi] = useState<string | null>(null);
  const [pendingDe, setPendingDe] = useState<string | null>(null);

  const pairedViIds = new Set(pairs.map((pair) => pair.viClipId));
  const pairedDeIds = new Set(pairs.map((pair) => pair.deClipId));
  const canSubmit = pairs.length > 0;

  const unpair = (predicate: (pair: PairingPairAttempt) => boolean) => {
    setPairs((current) => current.filter((pair) => !predicate(pair)));
  };

  const tapVi = (id: string) => {
    if (pairedViIds.has(id)) {
      unpair((pair) => pair.viClipId === id);
      return;
    }
    if (pendingDe) {
      setPairs((current) => [...current, { viClipId: id, deClipId: pendingDe }]);
      setPendingDe(null);
      setPendingVi(null);
      return;
    }
    setPendingVi((current) => (current === id ? null : id));
  };

  const tapDe = (id: string) => {
    if (pairedDeIds.has(id)) {
      unpair((pair) => pair.deClipId === id);
      return;
    }
    if (pendingVi) {
      setPairs((current) => [...current, { viClipId: pendingVi, deClipId: id }]);
      setPendingVi(null);
      setPendingDe(null);
      return;
    }
    setPendingDe((current) => (current === id ? null : id));
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(pairs);
  };

  return (
    <>
      <section className="flex flex-col gap-2 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">
          Ghép từ · Wörter zuordnen
        </span>
        <p className="text-[15px] font-medium text-[#86868b]">
          Chạm một từ tiếng Việt rồi một từ tiếng Đức để ghép chúng lại.
        </p>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <div className="flex flex-col gap-2">
          {viColumn.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => tapVi(item.id)}
              className={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-[15px] font-medium transition-colors ${chipClass(
                pendingVi === item.id,
                pairedViIds.has(item.id),
              )}`}
            >
              {item.vi}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {deColumn.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => tapDe(item.id)}
              className={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-[15px] font-medium transition-colors ${chipClass(
                pendingDe === item.id,
                pairedDeIds.has(item.id),
              )}`}
            >
              {item.de}
            </button>
          ))}
        </div>
      </section>

      <footer className="mt-6 flex flex-col items-center gap-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className={`group flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] px-6 py-3 text-[17px] font-semibold transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            canSubmit
              ? "bg-[#0066cc] text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] hover:-translate-y-0.5 active:scale-[0.98]"
              : "cursor-not-allowed bg-[#e8e8ed] text-[#86868b]"
          }`}
        >
          <span>Kiểm tra · Prüfen</span>
          <MaterialIcon
            name="arrow_forward"
            className="text-[20px] transition-transform duration-300 group-hover:translate-x-1"
          />
        </button>
      </footer>
    </>
  );
}
