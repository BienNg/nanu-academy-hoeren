"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { chunkyButton } from "@/components/chunkyButton";
import { CountUp, KindTile, QuestChest, QuestProgressBar } from "@/components/QuestParts";
import { localCalendarDay } from "@/lib/progress";
import { publishQuestBadge } from "@/lib/quest-badge";
import {
  isQuestIntroSurface,
  questIntroGreeting,
  questIntroKey,
  shouldShowQuestIntro,
} from "@/lib/quest-intro";
import { questZoneHeaders, readQuestBoard, type QuestBoardView } from "@/lib/quests";
import { playSuccessSound } from "@/lib/sfx";
import { readStreakCelebration } from "@/lib/useProgress";

/** When each beat of the reveal starts, in seconds. */
const BEAT = {
  greeting: 0.15,
  ribbon: 0.3,
  chestDrop: 0.55,
  chestShake: 1.0,
  chestOpen: 1.4,
  cards: 1.6,
  cardGap: 0.16,
  total: 2.25,
  cta: 2.5,
} as const;

const CONFETTI_COLORS = ["#FFC83D", "#34C759", "#0A84FF", "#FF6B6B", "#BF5AF2", "#FF9500"];

/** Deterministic spread, so the burst looks the same on every render. */
const CONFETTI = Array.from({ length: 30 }, (_, index) => {
  const angle = (index / 30) * Math.PI * 2 + ((index * 37) % 11) / 20;
  const distance = 110 + ((index * 53) % 90);
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance * 0.75,
    fall: 120 + ((index * 29) % 80),
    rotate: ((index * 71) % 360) - 180,
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length]!,
    round: index % 3 === 0,
  };
});

const STARS = [
  { x: 8, y: 12, size: 10, delay: 0.2 },
  { x: 88, y: 9, size: 14, delay: 0.9 },
  { x: 18, y: 34, size: 8, delay: 1.4 },
  { x: 92, y: 30, size: 9, delay: 0.5 },
  { x: 6, y: 62, size: 12, delay: 1.1 },
  { x: 94, y: 58, size: 10, delay: 0.3 },
  { x: 14, y: 86, size: 9, delay: 1.7 },
  { x: 84, y: 82, size: 13, delay: 0.7 },
  { x: 50, y: 4, size: 8, delay: 1.2 },
];

function readShownDay(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeShownDay(key: string, day: string): void {
  try {
    window.localStorage.setItem(key, day);
  } catch {
    // Storage can be blocked. The intro may then show again on the next load.
  }
}

/** Screens that already are the learning path, so starting just closes the intro. */
function onLearningPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname.startsWith("/learn/") ||
    pathname.startsWith("/interview/") ||
    pathname.startsWith("/living/")
  );
}

/**
 * Full-screen reveal of today's quests on the first app open of the learner's
 * local day. The quest day resets at local midnight, so the intro does too.
 */
export function DailyQuestIntro() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [board, setBoard] = useState<QuestBoardView | null>(null);
  const [open, setOpen] = useState(false);
  const checked = useRef<string | null>(null);
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!userId || board || !isQuestIntroSurface(pathname)) return;
    const today = localCalendarDay();
    const marker = `${userId}|${today}`;
    if (checked.current === marker) return;
    checked.current = marker;
    const key = questIntroKey(userId);
    if (readShownDay(key) === today) return;

    void fetch("/api/quests", { headers: questZoneHeaders() })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const next = readQuestBoard(data);
        if (!next) {
          checked.current = null;
          return;
        }
        publishQuestBadge(next.quests.filter((quest) => !quest.done).length);
        if (!shouldShowQuestIntro(readShownDay(key), today, next.quests)) {
          writeShownDay(key, today);
          return;
        }
        // The learner moved into a lesson, or the streak flame is up. Try again later.
        if (!isQuestIntroSurface(pathnameRef.current) || readStreakCelebration()) {
          checked.current = null;
          return;
        }
        setBoard(next);
        setOpen(true);
      })
      .catch(() => {
        checked.current = null;
      });
  }, [board, pathname, userId]);

  // Today counts as seen once the learner dismisses it. A reload or redirect
  // while it is still up brings it back.
  const close = useCallback(() => {
    if (userId) writeShownDay(questIntroKey(userId), localCalendarDay());
    setOpen(false);
  }, [userId]);
  const start = () => {
    playSuccessSound();
    close();
    if (!onLearningPath(pathnameRef.current)) router.push("/");
  };
  const viewQuests = () => {
    close();
    router.push("/quests");
  };

  return (
    <AnimatePresence onExitComplete={() => setBoard(null)}>
      {open && board ? (
        <QuestIntroOverlay
          key="quest-intro"
          board={board}
          onClose={close}
          onStart={start}
          onViewQuests={viewQuests}
        />
      ) : null}
    </AnimatePresence>
  );
}

function QuestIntroOverlay({
  board,
  onClose,
  onStart,
  onViewQuests,
}: {
  board: QuestBoardView;
  onClose: () => void;
  onStart: () => void;
  onViewQuests: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const [chestTimerDone, setChestTimerDone] = useState(false);
  const chestOpen = reduceMotion || chestTimerDone;
  const [now] = useState(() => new Date());
  const at = (seconds: number) => (reduceMotion ? 0 : seconds);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setTimeout(() => setChestTimerDone(true), BEAT.chestOpen * 1000);
    return () => window.clearTimeout(timer);
  }, [reduceMotion]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the dialog, not the button, so short screens open at the top of the reveal.
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const dateLabel = new Intl.DateTimeFormat("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const openXp =
    board.quests.reduce((sum, quest) => sum + (quest.done ? 0 : quest.xp), 0) +
    (board.bonus.claimed ? 0 : board.bonus.xp);

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quest-intro-title"
      tabIndex={-1}
      className="fixed inset-0 z-[110] overflow-x-hidden overflow-y-auto text-white outline-none"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 28%, #2f47c9 0%, #18257a 42%, #080d33 100%)",
      }}
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.3 }}
    >
      <Backdrop still={reduceMotion} />

      <div className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-safe pb-safe">
        <div className="flex h-14 items-center justify-end [@media(max-height:700px)]:h-11">
          <motion.button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: at(BEAT.cta), duration: 0.3 }}
          >
            <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
              close
            </span>
          </motion.button>
        </div>

        <motion.p
          className="text-center text-[13px] font-bold tracking-wide text-white/70"
          initial={reduceMotion ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(BEAT.greeting), duration: 0.35 }}
        >
          {questIntroGreeting(now.getHours())}! · <span className="capitalize">{dateLabel}</span>
        </motion.p>

        <Ribbon still={reduceMotion} />

        <Chest open={chestOpen} still={reduceMotion} />

        <ul className="relative z-10 -mt-2 flex flex-col gap-3">
          {board.quests.map((quest, index) => {
            const delay = BEAT.cards + BEAT.cardGap * index;
            return (
              <motion.li
                key={quest.id}
                className="relative flex items-center gap-3 overflow-hidden rounded-[20px] bg-white px-3.5 py-3 text-[#1d1d1f] shadow-[0_5px_0_0_rgba(0,0,0,0.28)]"
                initial={
                  reduceMotion
                    ? false
                    : { opacity: 0, y: -110 - index * 76, scale: 0.35, rotate: index % 2 ? 8 : -8 }
                }
                animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 260, damping: 19, delay }
                }
              >
                <KindTile kind={quest.kind} done={quest.done} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={`text-[14px] leading-[18px] font-extrabold ${
                        quest.done ? "text-[#86868b]" : ""
                      }`}
                    >
                      {quest.title}
                    </p>
                    <motion.span
                      className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#fff4d6] px-2 py-0.5 text-[12px] font-extrabold text-[#d97706]"
                      initial={reduceMotion ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { type: "spring", stiffness: 500, damping: 14, delay: delay + 0.35 }
                      }
                    >
                      <span
                        className="material-symbols-outlined text-[14px]"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                        aria-hidden="true"
                      >
                        bolt
                      </span>
                      +{quest.xp}
                    </motion.span>
                  </div>
                  <div className="mt-2 flex">
                    <QuestProgressBar quest={quest} delay={at(delay + 0.4)} />
                  </div>
                </div>
                {reduceMotion ? null : <CardShine delay={delay + 0.45} />}
              </motion.li>
            );
          })}
        </ul>

        <motion.div
          className="mt-4 flex items-center justify-center gap-2 text-[14px] font-bold text-white/80"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(BEAT.total), duration: 0.35 }}
        >
          <span>Phần thưởng hôm nay</span>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FFC83D] px-2.5 py-1 text-[15px] font-extrabold text-[#5c3200] shadow-[0_3px_0_0_#c98a00]">
            <span
              className="material-symbols-outlined text-[17px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              bolt
            </span>
            +<CountUp from={0} to={openXp} delay={at(BEAT.total) + 0.1} duration={0.9} /> XP
          </span>
        </motion.div>

        <div className="min-h-6 flex-1" />

        <motion.div
          className="flex flex-col items-center gap-1 pt-2 pb-4"
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 300, damping: 22, delay: BEAT.cta }
          }
        >
          <motion.button
            type="button"
            onClick={onStart}
            className={chunkyButton("success", "relative w-full overflow-hidden text-[17px]")}
            animate={reduceMotion ? undefined : { scale: [1, 1.03, 1] }}
            transition={
              reduceMotion
                ? undefined
                : { duration: 1.6, repeat: Infinity, ease: "easeInOut", delay: BEAT.cta + 0.6 }
            }
          >
            {reduceMotion ? null : <ButtonShine />}
            <span className="relative">Bắt đầu học</span>
          </motion.button>
          <button
            type="button"
            onClick={onViewQuests}
            className="mt-1 rounded-xl px-4 py-2.5 text-[13px] font-extrabold tracking-wider text-white/70 uppercase transition-colors hover:text-white"
          >
            Xem nhiệm vụ
          </button>
        </motion.div>
      </div>
    </motion.div>
  );
}

function Backdrop({ still }: { still: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute top-[30%] left-1/2 h-[1100px] w-[1100px] -translate-x-1/2 -translate-y-1/2"
        initial={still ? false : { opacity: 0, scale: 0.4 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: still ? 0 : 1.1, ease: "easeOut", delay: still ? 0 : 0.2 }}
      >
        <motion.div
          className="h-full w-full rounded-full"
          style={{
            background:
              "repeating-conic-gradient(from 0deg, rgba(255,214,102,0.16) 0deg 8deg, rgba(255,214,102,0) 8deg 22.5deg)",
            maskImage: "radial-gradient(circle, black 0%, black 18%, transparent 62%)",
            WebkitMaskImage: "radial-gradient(circle, black 0%, black 18%, transparent 62%)",
          }}
          animate={still ? undefined : { rotate: 360 }}
          transition={still ? undefined : { duration: 48, repeat: Infinity, ease: "linear" }}
        />
      </motion.div>
      {STARS.map((star) => (
        <motion.svg
          key={`${star.x}-${star.y}`}
          viewBox="0 0 20 20"
          className="absolute"
          style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size }}
          initial={still ? false : { opacity: 0, scale: 0 }}
          animate={
            still
              ? { opacity: 0.6, scale: 1 }
              : { opacity: [0, 1, 0.3, 1, 0], scale: [0, 1, 0.7, 1, 0], rotate: [0, 45, 90] }
          }
          transition={
            still
              ? { duration: 0 }
              : { duration: 3.2, delay: star.delay, repeat: Infinity, repeatDelay: 0.6 }
          }
        >
          <path d="M10 0 L12 8 L20 10 L12 12 L10 20 L8 12 L0 10 L8 8 Z" fill="#FFE07A" />
        </motion.svg>
      ))}
    </div>
  );
}

function Ribbon({ still }: { still: boolean }) {
  return (
    <motion.div
      className="relative mx-auto mt-3 flex items-center"
      initial={still ? false : { scaleX: 0, opacity: 0 }}
      animate={{ scaleX: 1, opacity: 1 }}
      transition={
        still ? { duration: 0 } : { type: "spring", stiffness: 240, damping: 16, delay: BEAT.ribbon }
      }
    >
      <RibbonTail side="left" />
      <div className="relative z-10 rounded-[14px] bg-gradient-to-b from-[#ffbf3a] to-[#ff8a00] px-6 py-2.5 shadow-[0_5px_0_0_#c2410c]">
        <motion.h2
          id="quest-intro-title"
          className="text-[24px] leading-7 font-extrabold whitespace-nowrap max-[359px]:text-[20px] text-white [text-shadow:0_2px_0_rgba(194,65,12,0.85)]"
          initial={still ? false : { scale: 1.8, opacity: 0, filter: "blur(6px)" }}
          animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
          transition={
            still
              ? { duration: 0 }
              : { type: "spring", stiffness: 320, damping: 15, delay: BEAT.ribbon + 0.15 }
          }
        >
          Nhiệm vụ hôm nay
        </motion.h2>
      </div>
      <RibbonTail side="right" />
    </motion.div>
  );
}

function RibbonTail({ side }: { side: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 28 40"
      className={`relative top-2.5 h-10 w-7 ${side === "left" ? "-mr-2" : "-ml-2 -scale-x-100"}`}
      aria-hidden="true"
    >
      <path d="M28 2 H2 L10 20 L2 38 H28 Z" fill="#e2620a" />
      <path d="M20 2 H28 V10 Z" fill="#9a3412" />
    </svg>
  );
}

function Chest({ open, still }: { open: boolean; still: boolean }) {
  return (
    <div className="relative mx-auto mt-2 flex h-[150px] w-full items-center justify-center [@media(max-height:700px)]:h-[112px] [@media(max-height:700px)]:scale-[0.8]">
      <motion.span
        className="absolute h-36 w-36 rounded-full bg-[#FFC83D]/40 blur-2xl"
        initial={false}
        animate={
          open && !still
            ? { opacity: [0.5, 0.9, 0.6], scale: [1, 1.15, 1] }
            : { opacity: open ? 0.7 : 0.25, scale: 1 }
        }
        transition={open && !still ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : undefined}
        aria-hidden="true"
      />
      {open && !still ? (
        <>
          <motion.span
            className="absolute h-24 w-24 rounded-full bg-white"
            initial={{ opacity: 0.95, scale: 0.2 }}
            animate={{ opacity: 0, scale: 5 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            aria-hidden="true"
          />
          <motion.span
            className="absolute h-28 w-28 rounded-full border-4 border-[#FFE07A]"
            initial={{ opacity: 1, scale: 0.3 }}
            animate={{ opacity: 0, scale: 3.2 }}
            transition={{ duration: 0.8, ease: "easeOut", delay: 0.05 }}
            aria-hidden="true"
          />
          {CONFETTI.map((piece, index) => (
            <motion.span
              key={index}
              className={`absolute ${piece.round ? "h-2 w-2 rounded-full" : "h-3 w-1.5 rounded-[2px]"}`}
              style={{ backgroundColor: piece.color }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0, scale: 0.4 }}
              animate={{
                x: [0, piece.x, piece.x * 1.1],
                y: [0, piece.y, piece.y + piece.fall],
                opacity: [1, 1, 0],
                rotate: [0, piece.rotate, piece.rotate * 2],
                scale: [0.4, 1, 0.9],
              }}
              transition={{ duration: 1.5, ease: ["easeOut", "easeIn"], times: [0, 0.35, 1] }}
              aria-hidden="true"
            />
          ))}
        </>
      ) : null}
      <motion.div
        className="relative"
        initial={still ? false : { y: -260, scale: 0.6, opacity: 0 }}
        animate={
          still
            ? { y: 0, scale: 1, opacity: 1 }
            : {
                y: [-260, 0, -18, 0],
                scale: [0.6, 1.08, 0.97, 1],
                opacity: [0, 1, 1, 1],
              }
        }
        transition={
          still
            ? { duration: 0 }
            : { duration: 0.75, times: [0, 0.55, 0.78, 1], ease: "easeOut", delay: BEAT.chestDrop }
        }
      >
        <motion.div
          animate={
            still || open
              ? { rotate: 0, scale: 1 }
              : { rotate: [0, -7, 7, -9, 9, -4, 0], scale: [1, 1.04, 1.04, 1.07, 1.07, 1.1, 1] }
          }
          transition={
            still || open
              ? { duration: 0.2 }
              : { duration: BEAT.chestOpen - BEAT.chestShake, delay: BEAT.chestShake, ease: "easeInOut" }
          }
        >
          <QuestChest open={open} size={124} />
        </motion.div>
      </motion.div>
    </div>
  );
}

function CardShine({ delay }: { delay: number }) {
  return (
    <motion.span
      className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent"
      initial={{ x: "-150%" }}
      animate={{ x: "450%" }}
      transition={{ duration: 0.7, delay, ease: "easeInOut" }}
      aria-hidden="true"
    />
  );
}

function ButtonShine() {
  return (
    <motion.span
      className="pointer-events-none absolute inset-y-0 left-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent"
      initial={{ x: "-150%" }}
      animate={{ x: "500%" }}
      transition={{ duration: 1.1, delay: BEAT.cta + 0.3, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
      aria-hidden="true"
    />
  );
}
