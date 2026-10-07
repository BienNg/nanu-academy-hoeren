"use client";

import Image from "next/image";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { CheckBar } from "@/components/session/FeedbackSheet";
import {
  digitLabel,
  digitShortcut,
  FOCUS_RING,
  isCardEnter,
  isKeyboardClick,
} from "@/lib/keyboard";

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
  /** A checked miss: chips stay, and no further pair can be made until retry. */
  locked?: boolean;
};

const MISS_MS = 720;

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

/** Digit hint for a chip, shown where a keyboard is likely. */
function ChipKey({ label }: { label: string }) {
  return (
    <kbd
      aria-hidden="true"
      className="absolute top-1/2 left-2 hidden h-6 min-w-6 -translate-y-1/2 items-center justify-center rounded-md border-2 border-current px-1 font-sans text-[12px] opacity-40 md:flex"
    >
      {label}
    </kbd>
  );
}

/**
 * Tap one Vietnamese chip, then one German chip (either order). The second
 * tap is checked immediately: a match locks green, a miss shakes both chips
 * and clears them. The round ends when every pair is green.
 * Keys 1–5 pick from the left column and 6–0 from the right. A chip locked
 * green from the keyboard hands focus to the next open chip in its column.
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
  locked = false,
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
  const gridRef = useRef<HTMLElement>(null);
  /** Column whose focused chip just locked; its next open chip takes focus. */
  const refocusColumn = useRef<"vi" | "de" | null>(null);
  const solved = items.length > 0 && matchedIds.size >= items.length;
  // Two columns share the ten digit keys, so larger sets go without them.
  const keyed = items.length * 2 <= 10;

  useEffect(() => {
    return () => {
      missGeneration.current += 1;
    };
  }, []);

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
    if (locked || wrong || solved || matchedIds.has(id)) return;
    if (pendingDe) {
      if (pendingDe === id) accept(id);
      else reject(id, pendingDe);
      return;
    }
    setPendingVi((current) => (current === id ? null : id));
  };

  const tapDe = (id: string) => {
    if (locked || wrong || solved || matchedIds.has(id)) return;
    if (pendingVi) {
      if (pendingVi === id) accept(id);
      else reject(pendingVi, id);
      return;
    }
    setPendingDe((current) => (current === id ? null : id));
  };

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (solved) {
      if (!isCardEnter(event)) return;
      event.preventDefault();
      event.stopPropagation();
      onNext();
      return;
    }
    if (locked) return;
    const index = keyed ? digitShortcut(event) : null;
    if (index === null || index >= viIds.length * 2) return;
    event.preventDefault();
    if (index < viIds.length) tapVi(viIds[index] as string);
    else tapDe(deIds[index - viIds.length] as string);
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener("keydown", listener, true);
    return () => window.removeEventListener("keydown", listener, true);
  }, []);

  useEffect(() => {
    const column = refocusColumn.current;
    refocusColumn.current = null;
    if (!column || solved) return;
    const openChip = (name: string) =>
      gridRef.current?.querySelector<HTMLButtonElement>(
        `[data-column="${name}"] button:not([disabled])`,
      );
    (openChip(column) ?? openChip(column === "vi" ? "de" : "vi"))?.focus();
  }, [matchedIds, solved]);

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

      <section ref={gridRef} className="mt-4 grid grid-cols-2 gap-3 rounded-[24px] bg-white/80 backdrop-blur-xl border border-white/20 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:p-6">
        <div data-column="vi" className="flex flex-col gap-2">
          {viColumn.map((item, index) => {
            const matched = matchedIds.has(item.id);
            const isWrong = wrong?.viId === item.id;
            const shortcut = keyed && !matched ? digitLabel(index) : null;
            return (
              <button
                key={item.id}
                type="button"
                // A miss only pauses taps; disabling would drop keyboard focus.
                disabled={matched || solved}
                aria-disabled={Boolean(wrong) || undefined}
                aria-pressed={pendingVi === item.id || matched}
                aria-keyshortcuts={shortcut ?? undefined}
                onClick={(event) => {
                  if (isKeyboardClick(event) && pendingDe === item.id) refocusColumn.current = "vi";
                  tapVi(item.id);
                }}
                className={`relative min-h-11 rounded-xl border px-3 py-2.5 text-left text-[15px] font-medium motion-reduce:animate-none disabled:cursor-default disabled:opacity-100 ${
                  item.image ? "flex items-center justify-center py-1.5" : "md:pl-10"
                } ${chipClass(pendingVi === item.id, matched, isWrong)} ${FOCUS_RING}`}
              >
                {shortcut ? <ChipKey label={shortcut} /> : null}
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
        <div data-column="de" className="flex flex-col gap-2">
          {deColumn.map((item, index) => {
            const matched = matchedIds.has(item.id);
            const isWrong = wrong?.deId === item.id;
            const shortcut = keyed && !matched ? digitLabel(items.length + index) : null;
            return (
              <button
                key={item.id}
                type="button"
                disabled={matched || solved}
                aria-disabled={Boolean(wrong) || undefined}
                aria-pressed={pendingDe === item.id || matched}
                aria-keyshortcuts={shortcut ?? undefined}
                onClick={(event) => {
                  if (isKeyboardClick(event) && pendingVi === item.id) refocusColumn.current = "de";
                  tapDe(item.id);
                }}
                className={`relative min-h-11 rounded-xl border px-3 py-2.5 text-left text-[15px] font-medium motion-reduce:animate-none disabled:cursor-default disabled:opacity-100 md:pl-10 ${chipClass(
                  pendingDe === item.id,
                  matched,
                  isWrong,
                )} ${FOCUS_RING}`}
              >
                {shortcut ? <ChipKey label={shortcut} /> : null}
                {item.de}
              </button>
            );
          })}
        </div>
      </section>

      {solved ? <CheckBar label={nextLabel} onClick={onNext} autoFocus /> : null}
    </>
  );
}
