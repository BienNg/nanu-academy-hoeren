"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from "react";
import { chunkyButton } from "@/components/chunkyButton";
import { BADGE_TIERS, type FreshBadge } from "@/lib/badges";

/**
 * A round medal. The ring shows the tier, the face shows the family.
 * Tier 0 is locked: grey with a padlock.
 */
export function BadgeMedal({
  icon,
  color,
  tier,
  size = 64,
}: {
  icon: string;
  color: string;
  tier: number;
  size?: number;
}) {
  const style = tier > 0 ? BADGE_TIERS[Math.min(tier, BADGE_TIERS.length) - 1]! : null;
  const lip = Math.max(2, Math.round(size / 16));
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        backgroundColor: style ? style.ring : "#e5e5ea",
        boxShadow: `0 ${lip}px 0 0 ${style ? style.lip : "#c7c7cc"}`,
      }}
      aria-hidden="true"
    >
      <span
        className="flex items-center justify-center rounded-full"
        style={{
          width: size * 0.8,
          height: size * 0.8,
          backgroundColor: style ? color : "#f2f2f7",
          border: `${Math.max(2, Math.round(size / 22))}px solid ${style ? style.glow : "#ffffff"}`,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: Math.round(size * 0.4),
            color: style ? "#ffffff" : "#aeaeb2",
            fontVariationSettings: "'FILL' 1, 'wght' 700",
          }}
        >
          {style ? icon : "lock"}
        </span>
      </span>
      {style && tier >= 4 ? (
        <span
          className="material-symbols-outlined absolute -top-1 -right-1 text-[#2BA8E0]"
          style={{ fontSize: Math.round(size * 0.3), fontVariationSettings: "'FILL' 1" }}
        >
          diamond
        </span>
      ) : null}
    </span>
  );
}

/** Four dots, filled up to `tier`, colored by tier. */
export function TierPips({ tier }: { tier: number }) {
  return (
    <span className="flex items-center gap-1" aria-label={`${tier} / ${BADGE_TIERS.length} cấp`}>
      {BADGE_TIERS.map((style, index) => (
        <span
          key={style.name}
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: index < tier ? style.ring : "#e5e5ea" }}
        />
      ))}
    </span>
  );
}

/**
 * Bottom sheet. Focus moves inside and stays there, Escape and a tap on the
 * backdrop close it, and focus goes back to whatever opened it.
 */
export function BadgeSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(onClose);
  const reduceMotion = useReducedMotion() ?? false;

  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.querySelector<HTMLElement>("button, a[href]")?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const inside = dialogRef.current?.contains(document.activeElement) ?? false;
      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
      role="presentation"
      onClick={onClose}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white px-5 pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.08)]"
        onClick={(event) => event.stopPropagation()}
        initial={reduceMotion ? false : { y: 40 }}
        animate={{ y: 0 }}
        exit={reduceMotion ? undefined : { y: 40 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[#e5e5ea]" aria-hidden="true" />
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        {children}
      </motion.div>
    </motion.div>
  );
}

/**
 * Full-screen "Huy hiệu mới!" celebration, one badge at a time, laid out like
 * the streak fire: the medal fills the middle and the button sits full width
 * along the bottom. `onDone` gets every id that was shown, so the caller can
 * mark them seen.
 */
export function BadgeUnlockSheet({
  badges,
  onDone,
  showCollectionLink = true,
}: {
  badges: readonly FreshBadge[];
  onDone: (ids: string[]) => void;
  showCollectionLink?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const reduceMotion = useReducedMotion() ?? false;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const badge = badges[Math.min(index, badges.length - 1)];
  const finish = useEffectEvent(() => {
    onDone(badges.map((entry) => entry.id));
  });

  useEffect(() => {
    const opener = document.activeElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") ?? [],
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const inside = dialogRef.current?.contains(document.activeElement) ?? false;
      if (event.shiftKey && (!inside || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", handleKeyDown, true);
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("button, a[href]")?.focus();
  }, [badge?.id]);

  if (!badge) return null;
  const last = index >= badges.length - 1;
  const tier = BADGE_TIERS[badge.tier - 1];
  const tierName = tier?.name ?? "";

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex flex-col items-center bg-[#fbfbfd] px-6 pt-safe pb-safe"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="text-[13px] font-extrabold tracking-wider text-[#0071E3] uppercase">
          Huy hiệu mới{badges.length > 1 ? ` · ${index + 1} / ${badges.length}` : ""}
        </span>
        <div className="relative my-6 flex h-44 w-44 items-center justify-center">
          <motion.span
            key={`glow-${badge.id}`}
            className="absolute h-40 w-40 rounded-full blur-2xl"
            style={{ backgroundColor: tier?.glow ?? "#f2f2f7" }}
            initial={reduceMotion ? false : { scale: 0.4, opacity: 0 }}
            animate={
              reduceMotion
                ? { scale: 1, opacity: 0.85 }
                : { scale: [0.92, 1.06, 0.96], opacity: [0.55, 0.9, 0.65] }
            }
            transition={
              reduceMotion ? { duration: 0.2 } : { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
            }
            aria-hidden="true"
          />
          <AnimatePresence mode="wait">
            <motion.span
              key={badge.id}
              className="relative"
              initial={reduceMotion ? false : { scale: 0.15, rotate: -12, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              exit={reduceMotion ? undefined : { scale: 0.6, opacity: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 14 }}
            >
              <BadgeMedal icon={badge.icon} color={badge.color} tier={badge.tier} size={128} />
            </motion.span>
          </AnimatePresence>
        </div>
        <h2 id={titleId} className="text-[28px] leading-8 font-extrabold tracking-tight text-[#1d1d1f]">
          {badge.title}
        </h2>
        <p className="mt-1 text-[17px] font-extrabold" style={{ color: tier?.lip ?? "#6e6e73" }}>
          Cấp {tierName}
        </p>
        <p className="mt-2 max-w-xs text-[17px] leading-snug font-semibold text-[#6e6e73]">{badge.goal}</p>
      </div>
      <div className="flex w-full max-w-md flex-col gap-3 pb-6">
        {last ? (
          <motion.button
            type="button"
            autoFocus
            className={chunkyButton("success", "w-full")}
            onClick={finish}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.45, duration: 0.25 }}
          >
            Tuyệt vời!
          </motion.button>
        ) : (
          <motion.button
            type="button"
            autoFocus
            className={chunkyButton("primary", "w-full")}
            onClick={() => setIndex((current) => current + 1)}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.45, duration: 0.25 }}
          >
            Tiếp theo
          </motion.button>
        )}
        {showCollectionLink ? (
          <Link href="/badges" className={chunkyButton("secondary", "w-full")} onClick={finish}>
            Xem bộ sưu tập
          </Link>
        ) : null}
      </div>
    </motion.div>
  );
}

/** Tell the server these unlocks were shown. Failures only mean the popup shows again. */
export function markBadgesSeenRemote(ids: readonly string[]): void {
  if (ids.length === 0) return;
  void fetch("/api/badges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seen: ids }),
  }).catch(() => {});
}
