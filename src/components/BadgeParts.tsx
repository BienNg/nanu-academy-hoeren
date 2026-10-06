"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from "react";
import { chunkyButton } from "@/components/chunkyButton";
import { BADGE_FAMILIES, BADGE_TIERS, type FreshBadge } from "@/lib/badges";

/** Medal metals from the badge design. Index 0 is Đồng. */
const MEDALS = [
  { base: "#C97B4A", dark: "#9A5630", light: "#E8AE88", plate: "#FBEEE4", ring: 0, studs: 0, gem: 0 },
  { base: "#AEB8C6", dark: "#7C8898", light: "#DDE4ED", plate: "#F3F6FA", ring: 1, studs: 0, gem: 0 },
  { base: "#FFC83D", dark: "#D99A00", light: "#FFE9A6", plate: "#FFF6D6", ring: 1, studs: 1, gem: 0 },
  { base: "#5CC8F5", dark: "#2A93D1", light: "#C4EEFF", plate: "#E6F6FF", ring: 1, studs: 1, gem: 1 },
] as const;

const LOCKED_MEDAL = {
  base: "#D1D1D6",
  dark: "#AEAEB2",
  light: "#E5E5EA",
  plate: "#F5F5F7",
  ring: 0,
  studs: 0,
  gem: 0,
};

/** Ribbon colour shows the group: Học tập, Thói quen, Thi đấu. */
const RIBBONS = {
  learning: { light: "#0071E3", dark: "#0A4FA0" },
  habit: { light: "#FF9500", dark: "#D97A00" },
  compete: { light: "#E5484D", dark: "#B93238" },
} as const;

const LOCKED_RIBBON = { light: "#C7C7CC", dark: "#AEAEB2" };

const EMBLEM = "translate(36 30) scale(0.75)";

function BadgeEmblem({ familyId }: { familyId: string }) {
  switch (familyId) {
    case "xp":
      return (
        <g transform={EMBLEM}>
          <rect x="27" y="4" width="10" height="56" rx="3" fill="#0071E3" />
          <rect x="27" y="4" width="10" height="56" rx="3" fill="#0071E3" transform="rotate(45 32 32)" />
          <rect x="27" y="4" width="10" height="56" rx="3" fill="#0071E3" transform="rotate(90 32 32)" />
          <rect x="27" y="4" width="10" height="56" rx="3" fill="#0071E3" transform="rotate(135 32 32)" />
          <circle cx="32" cy="32" r="21" fill="#0071E3" />
          <circle cx="32" cy="32" r="13.5" fill="#FFFFFF" />
          <path
            d="M34 21 L25 34 H31 L29 43 L39 30 H33 Z"
            fill="#FF9500"
            stroke="#FF9500"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </g>
      );
    case "listening":
      return (
        <g transform={EMBLEM}>
          <g transform="rotate(-35 32 32)">
            <rect x="16" y="28.5" width="32" height="7" rx="3.5" fill="#232F4B" />
            <rect x="2" y="23" width="9" height="18" rx="4.5" fill="#FF9500" />
            <rect x="53" y="23" width="9" height="18" rx="4.5" fill="#FF9500" />
            <rect x="9" y="16" width="11" height="32" rx="5.5" fill="#FFC83D" stroke="#FF9500" strokeWidth="1.5" />
            <rect x="44" y="16" width="11" height="32" rx="5.5" fill="#FFC83D" stroke="#FF9500" strokeWidth="1.5" />
            <path d="M14.5 22 V30 M49.5 22 V30" stroke="#FFE7A3" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>
      );
    case "perfect":
      return (
        <g transform={EMBLEM}>
          <text
            x="32"
            y="33"
            textAnchor="middle"
            fontSize="29"
            fontWeight="700"
            letterSpacing="-1.5"
            fill="#0071E3"
            style={{ fontFamily: "var(--font-plus-jakarta-sans), 'Plus Jakarta Sans', sans-serif" }}
          >
            100
          </text>
          <text
            x="32"
            y="58"
            textAnchor="middle"
            fontSize="25"
            fontWeight="700"
            fill="#FF9500"
            style={{ fontFamily: "var(--font-plus-jakarta-sans), 'Plus Jakarta Sans', sans-serif" }}
          >
            %
          </text>
        </g>
      );
    case "study":
      return (
        <g transform={EMBLEM}>
          <path d="M5 21 Q5 17 9 17 H55 Q59 17 59 21 V50 Q59 54 55 54 H9 Q5 54 5 50 Z" fill="#232F4B" />
          <path d="M9 14 Q22 9 32 16 V49 Q22 43 9 46 Z" fill="#E3EEFB" />
          <path d="M55 14 Q42 9 32 16 V49 Q42 43 55 46 Z" fill="#C9DFF8" />
          <path
            d="M14 23 Q21 21 27 24 M14 30 Q21 28 27 31 M14 37 Q19 36 23 37"
            stroke="#0071E3"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M37 31 Q43 28 50 30 M37 38 Q43 35 50 37"
            stroke="#0071E3"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M40 10 H48 V27 L44 23.5 L40 27 Z" fill="#FF9500" />
        </g>
      );
    case "lessons":
      return (
        <g transform={EMBLEM}>
          <path
            d="M36 55 L49 33 L61 55 Z"
            fill="#5AA7F5"
            stroke="#5AA7F5"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M5 55 L27 22 L39 40 L44 33 L57 55 Z"
            fill="#0071E3"
            stroke="#0071E3"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M27 22 L34 32.5 L28 30 L21 31 Z"
            fill="#FFFFFF"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M27 21 V5" stroke="#232F4B" strokeWidth="3.5" strokeLinecap="round" />
          <path
            d="M28 5 L44 10.5 L28 16 Z"
            fill="#FF9500"
            stroke="#FF9500"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      );
    case "streak":
      return (
        <g transform={EMBLEM}>
          <path
            d="M32 3 C36 16 51 22 51 39 C51 51 43 60 32 60 C21 60 13 51 13 39 C13 31 17 26 21 20 C23 26 25 28 28 28 C28 18 30 10 32 3 Z"
            fill="#FF9500"
          />
          <path d="M32 31 C36 38 41 40 41 47 C41 53 37 57 32 57 C27 57 23 53 23 47 C23 40 29 38 32 31 Z" fill="#FFC83D" />
        </g>
      );
    case "quests":
      return (
        <g transform={EMBLEM}>
          <rect x="8" y="30" width="48" height="27" rx="6" fill="#0A4FA0" />
          <path d="M8 34 V25 Q8 11 22 11 H42 Q56 11 56 25 V34 Z" fill="#0071E3" />
          <path d="M15 21 Q16 16 22 16" stroke="#6DB2F7" strokeWidth="3" strokeLinecap="round" />
          <rect x="14" y="40" width="5" height="17" rx="2.5" fill="#FFC83D" />
          <rect x="45" y="40" width="5" height="17" rx="2.5" fill="#FFC83D" />
          <rect x="5" y="29" width="54" height="8" rx="4" fill="#FFC83D" />
          <rect x="25" y="26" width="14" height="17" rx="5" fill="#FF9500" />
          <circle cx="32" cy="33" r="2.4" fill="#232F4B" />
          <rect x="30.8" y="33" width="2.4" height="6" rx="1.2" fill="#232F4B" />
        </g>
      );
    case "duel":
      return (
        <g transform={EMBLEM}>
          <g transform="rotate(45 32 32)">
            <path d="M32 5L37.5 11V38H26.5V11Z" fill="#AEBBD3" />
            <path d="M32 9V38" stroke="#7C8898" strokeWidth="2" strokeLinecap="round" />
            <rect x="20" y="37" width="24" height="6" rx="3" fill="#FF9500" />
            <rect x="28.5" y="43" width="7" height="11" rx="3.5" fill="#232F4B" />
            <circle cx="32" cy="56.5" r="3.8" fill="#FFC83D" />
          </g>
          <g transform="rotate(-45 32 32)">
            <path d="M32 5L37.5 11V38H26.5V11Z" fill="#AEBBD3" />
            <path d="M32 9V38" stroke="#7C8898" strokeWidth="2" strokeLinecap="round" />
            <rect x="20" y="37" width="24" height="6" rx="3" fill="#FF9500" />
            <rect x="28.5" y="43" width="7" height="11" rx="3.5" fill="#232F4B" />
            <circle cx="32" cy="56.5" r="3.8" fill="#FFC83D" />
          </g>
        </g>
      );
    case "blitz":
      return (
        <g transform={EMBLEM}>
          <path d="M5 21 H15 M2 32 H10 M6 45 H14" stroke="#0071E3" strokeWidth="3.5" strokeLinecap="round" />
          <path
            d="M40 5 L17 36 H31 L26 59 L52 27 H37 Z"
            fill="#FFC83D"
            stroke="#FF9500"
            strokeWidth="4"
            strokeLinejoin="round"
          />
        </g>
      );
    case "podium":
      return (
        <g transform={EMBLEM}>
          <rect x="5" y="36" width="17" height="20" rx="4" fill="#5AA7F5" />
          <rect x="42" y="42" width="17" height="14" rx="4" fill="#5AA7F5" />
          <rect x="21" y="27" width="22" height="29" rx="4" fill="#0071E3" />
          <rect x="24" y="30" width="16" height="3" rx="1.5" fill="#FFFFFF" opacity="0.35" />
          <rect x="3" y="52" width="58" height="6" rx="3" fill="#0A4FA0" />
          <path
            d="M32 6.5L35.1 12.8L42 13.8L37 18.7L38.2 25.6L32 22.3L25.8 25.6L27 18.7L22 13.8L28.9 12.8Z"
            fill="#FF9500"
            stroke="#FF9500"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </g>
      );
    case "champion":
      return (
        <g transform={EMBLEM}>
          <path
            d="M19 14 H9 C9 25 14 30 22 30 M45 14 H55 C55 25 50 30 42 30"
            stroke="#FF9500"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M17 8 H47 V24 C47 35 40 42 32 42 C24 42 17 35 17 24 Z"
            fill="#FFC83D"
            stroke="#FF9500"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path
            d="M29.5 19 L33 16 V31"
            stroke="#D97A00"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="28.5" y="42" width="7" height="8" fill="#FF9500" />
          <rect x="19" y="49" width="26" height="8" rx="3.5" fill="#232F4B" />
        </g>
      );
    default:
      return (
        <g transform={EMBLEM}>
          <rect x="18" y="28" width="28" height="22" rx="6" fill="#8E8E93" />
          <path d="M24 28 V21 a8 8 0 0 1 16 0 V28" fill="none" stroke="#8E8E93" strokeWidth="5" />
        </g>
      );
  }
}

/**
 * Medal from the badge design. The metal shows the tier, the emblem shows the
 * family, and the ribbon shows the group. Tier 0 is locked: a grey medal.
 * `muted` dims a tier the learner has not earned yet.
 */
export function BadgeMedal({
  familyId,
  tier,
  size = 64,
  muted = false,
}: {
  familyId: string;
  tier: number;
  size?: number;
  muted?: boolean;
}) {
  const family = BADGE_FAMILIES.find((entry) => entry.id === familyId);
  const locked = tier <= 0;
  const metal = locked ? LOCKED_MEDAL : MEDALS[Math.min(tier, MEDALS.length) - 1]!;
  const ribbon = locked || !family ? LOCKED_RIBBON : RIBBONS[family.group];
  return (
    <span
      className="relative inline-flex shrink-0"
      style={{ width: size, height: size, opacity: muted ? 0.4 : 1 }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 120 120" width={size} height={size} fill="none">
        <path d="M38 84 L30 115 L42 108 L50 117 L54 88 Z" fill={ribbon.light} />
        <path d="M82 84 L90 115 L78 108 L70 117 L66 88 Z" fill={ribbon.dark} />
        <circle cx="60" cy="58" r="44" fill={metal.dark} />
        <circle cx="60" cy="54" r="44" fill={metal.base} />
        <path d="M27 42 A35 35 0 0 1 48 21" stroke={metal.light} strokeWidth="4" strokeLinecap="round" />
        <g fill={metal.light} opacity={metal.studs}>
          <circle cx="99" cy="54" r="2.6" />
          <circle cx="79.5" cy="87.8" r="2.6" />
          <circle cx="40.5" cy="87.8" r="2.6" />
          <circle cx="21" cy="54" r="2.6" />
          <circle cx="79.5" cy="20.2" r="2.6" />
        </g>
        <circle cx="60" cy="54" r="34" fill={metal.plate} />
        <circle cx="60" cy="54" r="34" stroke={metal.dark} strokeWidth="2.5" opacity={metal.ring} />
        <g opacity={metal.gem}>
          <path
            d="M60 0 L69 10 L60 20 L51 10 Z"
            fill={metal.light}
            stroke={metal.dark}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <path d="M14 12 L16.500 19.500 L24 22 L16.500 24.500 L14 32 L11.500 24.500 L4 22 L11.500 19.500 Z" fill={metal.base} />
          <path d="M106 26 L108 32 L114 34 L108 36 L106 42 L104 36 L98 34 L104 32 Z" fill={metal.base} />
        </g>
        <BadgeEmblem familyId={familyId} />
      </svg>
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
              <BadgeMedal familyId={badge.family} tier={badge.tier} size={128} />
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
