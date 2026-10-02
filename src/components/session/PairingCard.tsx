"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** `image` (a public URL) replaces the Vietnamese text in the left column. */
type PairingItem = { id: string; vi: string; de: string; image?: string };

type PairingCardProps = {
  items: PairingItem[];
  /** First wrong pair on this card: what they joined, and the German that matches the Vietnamese chip. Later misses stay visual only. */
  onMistake: (entered: string, correct: string) => void;
  /** Every pair is matched. The card stays up so the student can continue. */
  onSolved: () => void;
  onNext: () => void;
  nextLabel?: string;
};

const MISS_MS = 720;

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

function chipClass(pending: boolean, matched: boolean, wrong: boolean): string {
  const base = "border-b-[3px]";
  if (wrong) return `${base} pairing-miss border-[#ff3b30] bg-[#ff3b30]/10 text-[#ff3b30]`;
  if (matched) return `${base} pairing-hit border-[#34C759] bg-[#34C759]/15 text-[#248a3d]`;
  if (pending) return `${base} border-[#0066cc] bg-[#0066cc]/10 text-[#0066cc]`;
  return `${base} border-black/[0.08] bg-white text-[#1d1d1f] hover:bg-[#f5f5f7]`;
}

/**
 * Tap one Vietnamese chip, then one German chip (either order). The second
 * tap is checked immediately: a match locks green, a miss shakes both chips
 * and clears them. The round ends when every pair is green.
 * Column order is chosen once at mount. The parent passes a fresh `items`
 * array on later renders (progress sync), and reshuffling then would move
 * tiles the student is already matching.
 */
export function PairingCard({
  items,
  onMistake,
  onSolved,
  onNext,
  nextLabel = "Tiếp theo",
}: PairingCardProps) {
  const [viIds] = useState(() => shuffleOnce(items.map((item) => item.id)));
  const [deIds] = useState(() => shuffleOnce(items.map((item) => item.id)));
  const byId = new Map(items.map((item) => [item.id, item]));
  const viColumn = viIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  const deColumn = deIds.flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });

  const [matchedIds, setMatchedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [pendingVi, setPendingVi] = useState<string | null>(null);
  const [pendingDe, setPendingDe] = useState<string | null>(null);
  const [wrong, setWrong] = useState<{ viId: string; deId: string } | null>(null);
  const missGeneration = useRef(0);
  const solved = items.length > 0 && matchedIds.size >= items.length;

  useEffect(() => {
    return () => {
      missGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!solved) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onNext();
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onNext, solved]);

  const accept = (id: string) => {
    const complete = matchedIds.size + 1 >= items.length;
    setMatchedIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    setPendingVi(null);
    setPendingDe(null);
    setWrong(null);
    if (complete) onSolved();
  };

  const reject = (viId: string, deId: string) => {
    const generation = missGeneration.current + 1;
    missGeneration.current = generation;
    setPendingVi(null);
    setPendingDe(null);
    setWrong({ viId, deId });
    const viItem = byId.get(viId);
    const deItem = byId.get(deId);
    if (viItem && deItem) onMistake(`${viItem.vi} ↔ ${deItem.de}`, `${viItem.vi} ↔ ${viItem.de}`);
    window.setTimeout(() => {
      if (missGeneration.current !== generation) return;
      setWrong(null);
    }, MISS_MS);
  };

  const tapVi = (id: string) => {
    if (wrong || solved || matchedIds.has(id)) return;
    if (pendingDe) {
      if (pendingDe === id) accept(id);
      else reject(id, pendingDe);
      return;
    }
    setPendingVi((current) => (current === id ? null : id));
  };

  const tapDe = (id: string) => {
    if (wrong || solved || matchedIds.has(id)) return;
    if (pendingVi) {
      if (pendingVi === id) accept(id);
      else reject(pendingVi, id);
      return;
    }
    setPendingDe((current) => (current === id ? null : id));
  };

  return (
    <>
      <section className="flex flex-col gap-2 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#86868b]">
          Ghép từ · Wörter zuordnen
        </span>
        <p className="text-[15px] font-medium text-[#86868b]">
          {items.some((item) => item.image)
            ? "Chạm một hình và một từ. Đúng thì xanh ngay, sai thì thử lại."
            : "Chạm một từ mỗi cột. Đúng thì xanh ngay, sai thì thử lại."}
        </p>
      </section>

      <section className="mt-4 grid grid-cols-2 gap-3 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <div className="flex flex-col gap-2">
          {viColumn.map((item) => {
            const matched = matchedIds.has(item.id);
            const isWrong = wrong?.viId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={matched || Boolean(wrong) || solved}
                aria-pressed={pendingVi === item.id || matched}
                onClick={() => tapVi(item.id)}
                className={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-[15px] font-medium motion-reduce:animate-none disabled:cursor-default disabled:opacity-100 ${
                  item.image ? "flex items-center justify-center py-1.5" : ""
                } ${chipClass(pendingVi === item.id, matched, isWrong)}`}
              >
                {item.image ? (
                  <Image
                    src={item.image}
                    alt={item.vi}
                    width={96}
                    height={96}
                    className="h-14 w-14 object-contain"
                  />
                ) : (
                  item.vi
                )}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {deColumn.map((item) => {
            const matched = matchedIds.has(item.id);
            const isWrong = wrong?.deId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={matched || Boolean(wrong) || solved}
                aria-pressed={pendingDe === item.id || matched}
                onClick={() => tapDe(item.id)}
                className={`min-h-11 rounded-xl border px-3 py-2.5 text-left text-[15px] font-medium motion-reduce:animate-none disabled:cursor-default disabled:opacity-100 ${chipClass(
                  pendingDe === item.id,
                  matched,
                  isWrong,
                )}`}
              >
                {item.de}
              </button>
            );
          })}
        </div>
      </section>

      {solved ? (
        <footer className="mt-6 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onNext}
            className="group flex h-[56px] w-full items-center justify-center gap-2 rounded-[16px] bg-[#0066cc] px-6 py-3 text-[17px] font-semibold text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,102,204,0.4)] active:scale-[0.98]"
          >
            <span>{nextLabel}</span>
            <MaterialIcon
              name="arrow_forward"
              className="text-[20px] transition-transform duration-300 group-hover:translate-x-1"
            />
          </button>
        </footer>
      ) : null}
    </>
  );
}
