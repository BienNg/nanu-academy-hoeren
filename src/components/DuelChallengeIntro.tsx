"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { chunkyButton } from "@/components/chunkyButton";
import { readQuestIntroDay, subscribeQuestIntroDay } from "@/components/DailyQuestIntro";
import {
  DUEL_SIZE,
  DUEL_WIN_XP,
  challengeIntroKey,
  challengeLeftLabel,
  earliestChallenge,
  nameInitial,
  type IncomingChallenge,
} from "@/lib/duels";
import { localCalendarDay } from "@/lib/progress";
import { isQuestIntroSurface } from "@/lib/quest-intro";
import { CHALLENGER_ALARM_STEP, playChallengerAlarm, playSuccessSound } from "@/lib/sfx";
import { flushTrackedClicks, trackUiClick } from "@/lib/ui-clicks";
import { useStreakCelebrationPending } from "@/lib/useProgress";

/** When each beat of the showdown starts, in seconds. */
const BEAT = {
  panels: 0.05,
  label: 0.3,
  fighters: 0.4,
  vs: 0.85,
  title: 1.05,
  chips: 1.25,
  cta: 1.5,
} as const;

export const CHALLENGER = { face: "#e11d48", lip: "#9f1239", wash: "#ffe4e6" };
export const YOU = { face: "#0284c7", lip: "#075985", wash: "#e0f2fe" };

const SPARK_COLORS = ["#FFE07A", "#FFC83D", "#ffffff", "#fb7185", "#7dd3fc"];

/** Deterministic spread, so the burst looks the same on every render. */
const SPARKS = Array.from({ length: 18 }, (_, index) => {
  const angle = (index / 18) * Math.PI * 2 + ((index * 37) % 7) / 10;
  const distance = 70 + ((index * 53) % 60);
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    rotate: (angle * 180) / Math.PI,
    color: SPARK_COLORS[index % SPARK_COLORS.length]!,
  };
});

function readShownDay(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

const SHOWN_DAY_EVENT = "nanu-challenge-intro-day";

function writeShownDay(key: string, day: string): void {
  try {
    window.localStorage.setItem(key, day);
  } catch {
    // Storage can be blocked. The showdown may then come back on the next load.
  }
  window.dispatchEvent(new Event(SHOWN_DAY_EVENT));
}

function subscribeShownDay(onChange: () => void): () => void {
  window.addEventListener(SHOWN_DAY_EVENT, onChange);
  return () => window.removeEventListener(SHOWN_DAY_EVENT, onChange);
}

let tabRequest = 0;
let handledTabRequest = 0;
const tabListeners = new Set<() => void>();

function notifyTabRequest(): void {
  tabListeners.forEach((listener) => listener());
}

/** The learner opened the Đấu tab while a challenge is waiting. Shows the showdown again. */
export function requestChallengeShowdown(): void {
  tabRequest += 1;
  notifyTabRequest();
}

function dismissTabRequest(): void {
  if (handledTabRequest === tabRequest) return;
  handledTabRequest = tabRequest;
  notifyTabRequest();
}

function subscribeTabRequest(onChange: () => void): () => void {
  tabListeners.add(onChange);
  return () => tabListeners.delete(onChange);
}

/**
 * A full-screen showdown for the earliest open challenge. It opens on the
 * first app open of the learner's local day that has one, after the daily
 * quest intro, and again on every Đấu tab click while a challenge is open.
 */
export function DuelChallengeIntro({
  challenges,
  blocked,
}: {
  challenges: readonly IncomingChallenge[];
  /** Another overlay from the nav is up. */
  blocked: boolean;
}) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const questIntroDay = useSyncExternalStore(
    subscribeQuestIntroDay,
    () => (userId ? readQuestIntroDay(userId) : null),
    () => null,
  );
  const shownDay = useSyncExternalStore(
    subscribeShownDay,
    () => (userId ? readShownDay(challengeIntroKey(userId)) : null),
    () => null,
  );
  const tabRequestCount = useSyncExternalStore(subscribeTabRequest, () => tabRequest, () => 0);
  const handledTabCount = useSyncExternalStore(subscribeTabRequest, () => handledTabRequest, () => 0);
  const celebrating = useStreakCelebrationPending();
  const [challenge, setChallenge] = useState<IncomingChallenge | null>(null);
  const [accepting, setAccepting] = useState(false);
  const first = earliestChallenge(challenges);
  const today = localCalendarDay();
  const quiet = blocked || celebrating;
  const dailyDue =
    userId != null &&
    first != null &&
    !quiet &&
    pathname !== "/duel" &&
    isQuestIntroSurface(pathname) &&
    questIntroDay === today &&
    shownDay !== today;
  // A tab click shows it even on the Đấu page, and again after today's daily one.
  const tabDue = first != null && !quiet && tabRequestCount > handledTabCount;
  const due = dailyDue || tabDue;
  // Keep the first challenge shown, even if a later refresh reorders the list.
  if (due && !challenge) setChallenge(first);
  const open = challenge != null && (due || accepting);

  // Today counts as seen once the learner answers. A reload while it is still up brings it back.
  const later = useCallback(() => {
    trackUiClick("duel.challenge.later");
    flushTrackedClicks();
    dismissTabRequest();
    if (userId) writeShownDay(challengeIntroKey(userId), localCalendarDay());
  }, [userId]);

  const accept = () => {
    if (!challenge || accepting) return;
    setAccepting(true);
    trackUiClick("duel.challenge.accept");
    flushTrackedClicks();
    dismissTabRequest();
    if (userId) writeShownDay(challengeIntroKey(userId), localCalendarDay());
    playSuccessSound();
    // The overlay stays up until the duel page replaces this screen.
    router.push(`/duel/${challenge.id}`);
  };

  return (
    <AnimatePresence onExitComplete={() => setChallenge(null)}>
      {open && challenge ? (
        <ShowdownOverlay
          key="challenge-intro"
          challenge={challenge}
          yourInitial={nameInitial(session?.user?.name)}
          accepting={accepting}
          onLater={later}
          onAccept={accept}
        />
      ) : null}
    </AnimatePresence>
  );
}

export function ShowdownOverlay({
  challenge,
  yourInitial,
  accepting,
  onLater,
  onAccept,
}: {
  challenge: IncomingChallenge;
  yourInitial: string;
  accepting: boolean;
  onLater: () => void;
  onAccept: () => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const at = (seconds: number) => (reduceMotion ? 0 : seconds);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [now] = useState(() => new Date());
  const deadline = challengeLeftLabel(challenge.expiresAt, now, "you");

  useEffect(() => {
    if (reduceMotion) return;
    return playChallengerAlarm();
  }, [reduceMotion]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Focus the dialog, not the button, so short screens open at the top of the showdown.
    dialogRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onLater();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onLater]);

  const rise = (delay: number) =>
    reduceMotion
      ? { initial: false as const, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
      : {
          initial: { opacity: 0, y: 14 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.3 },
        };

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="challenge-intro-title"
      aria-describedby="challenge-intro-note"
      tabIndex={-1}
      className="fixed inset-0 z-[110] overflow-x-hidden overflow-y-auto bg-[#070b24] text-white outline-none"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.25 }}
    >
      <Arena still={reduceMotion} impactAt={BEAT.vs} />
      {reduceMotion ? null : <ChallengerAlarm until={BEAT.vs} />}

      <motion.div
        className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-safe pb-safe"
        animate={reduceMotion ? undefined : { x: [0, 0, -9, 8, -5, 3, 0] }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 0.45, times: [0, 0.01, 0.2, 0.4, 0.6, 0.8, 1], delay: BEAT.vs + 0.08 }
        }
      >
        <motion.p
          className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-white/90 ring-1 ring-white/15"
          initial={reduceMotion ? false : { opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: at(BEAT.label), duration: 0.3 }}
        >
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            swords
          </span>
          Lời thách đấu mới
        </motion.p>

        <div className="min-h-6 flex-1" />

        <div className="relative grid grid-cols-[1fr_auto_1fr] items-start gap-1 sm:gap-3">
          <Fighter
            side="left"
            initial={nameInitial(challenge.opponentName)}
            name={challenge.opponentName}
            role="Người thách đấu"
            colors={CHALLENGER}
            still={reduceMotion}
          />
          <VsBadge still={reduceMotion} />
          <Fighter
            side="right"
            initial={yourInitial}
            name="Bạn"
            role="Người nhận"
            colors={YOU}
            still={reduceMotion}
          />
        </div>

        <motion.h2
          id="challenge-intro-title"
          className="mt-8 text-center text-[30px] leading-[1.15] font-extrabold tracking-tight [text-shadow:0_3px_0_rgba(0,0,0,0.35)] [@media(max-height:700px)]:mt-5 [@media(max-height:700px)]:text-[26px] sm:text-[34px]"
          initial={reduceMotion ? false : { opacity: 0, scale: 1.6, filter: "blur(6px)" }}
          animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
          transition={
            reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 16, delay: BEAT.title }
          }
        >
          <span className="break-words">{challenge.opponentName}</span> thách đấu bạn!
        </motion.h2>
        <motion.p
          id="challenge-intro-note"
          className="mt-2 text-center text-[15px] font-semibold leading-snug text-white/80"
          {...rise(BEAT.title + 0.15)}
        >
          Cùng {DUEL_SIZE} câu. Ai làm đúng nhanh hơn ở mỗi câu được 1 điểm.
        </motion.p>

        <motion.ul className="mt-5 flex flex-wrap items-center justify-center gap-2" {...rise(BEAT.chips)}>
          <Chip icon="bolt" filled tone="gold">
            Thắng +{DUEL_WIN_XP} XP
          </Chip>
          {deadline ? <Chip icon="schedule">{deadline}</Chip> : null}
        </motion.ul>

        <div className="min-h-8 flex-1" />

        <motion.div
          className="flex flex-col items-center gap-1 pt-2 pb-4"
          initial={reduceMotion ? false : { opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 22, delay: BEAT.cta }
          }
        >
          <motion.button
            type="button"
            onClick={onAccept}
            disabled={accepting}
            className={chunkyButton(accepting ? "disabled" : "success", "relative w-full overflow-hidden text-[17px]")}
            animate={reduceMotion || accepting ? undefined : { scale: [1, 1.03, 1] }}
            transition={
              reduceMotion || accepting
                ? undefined
                : { duration: 1.4, repeat: Infinity, ease: "easeInOut", delay: BEAT.cta + 0.6 }
            }
          >
            {reduceMotion || accepting ? null : <ButtonShine />}
            <span className="material-symbols-outlined relative text-[22px]" aria-hidden="true">
              swords
            </span>
            <span className="relative">{accepting ? "Đang vào trận..." : "Chấp nhận"}</span>
          </motion.button>
          <button
            type="button"
            onClick={onLater}
            disabled={accepting}
            className="mt-1 rounded-xl px-4 py-2.5 text-[13px] font-extrabold tracking-wider text-white/70 uppercase transition-colors hover:text-white disabled:opacity-40"
          >
            Để sau
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

/**
 * Two colored halves that slam together on a diagonal. The glowing seam and
 * flash land `impactAt` seconds after it mounts, or not until it is set.
 */
export function Arena({ still, impactAt }: { still: boolean; impactAt: number | null }) {
  const stripes =
    "repeating-linear-gradient(118deg, rgba(255,255,255,0.07) 0 2px, rgba(255,255,255,0) 2px 26px)";
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute inset-0"
        style={{
          clipPath: "polygon(0 0, 57% 0, 37% 100%, 0 100%)",
          background: `${stripes}, linear-gradient(160deg, #fb7185 0%, #e11d48 38%, #881337 100%)`,
        }}
        initial={still ? false : { x: "-100%" }}
        animate={{ x: 0 }}
        transition={still ? { duration: 0 } : { type: "spring", stiffness: 210, damping: 24, delay: BEAT.panels }}
      />
      <motion.div
        className="absolute inset-0"
        style={{
          clipPath: "polygon(57% 0, 100% 0, 100% 100%, 37% 100%)",
          background: `${stripes}, linear-gradient(200deg, #38bdf8 0%, #0284c7 40%, #0c2d6b 100%)`,
        }}
        initial={still ? false : { x: "100%" }}
        animate={{ x: 0 }}
        transition={still ? { duration: 0 } : { type: "spring", stiffness: 210, damping: 24, delay: BEAT.panels }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(90%_60%_at_50%_38%,rgba(7,11,36,0)_0%,rgba(7,11,36,0.55)_100%)]" />
      {impactAt == null ? null : <ArenaImpact still={still} delay={impactAt} />}
    </div>
  );
}

/** Rotating warning beams and a pulsing red wash, cut off when the VS badge hits. */
function ChallengerAlarm({ until }: { until: number }) {
  const pulses = Math.max(2, Math.ceil(until / CHALLENGER_ALARM_STEP));
  const opacity: number[] = [];
  const times: number[] = [];
  for (let index = 0; index < pulses; index += 1) {
    const start = (index * CHALLENGER_ALARM_STEP) / until;
    const peak = Math.min(start + 0.08, 0.96);
    if (times.length === 0 || start > times[times.length - 1]!) {
      times.push(start);
      opacity.push(0.2);
    }
    if (peak > times[times.length - 1]!) {
      times.push(peak);
      opacity.push(index % 2 === 0 ? 1 : 0.72);
    }
  }
  times.push(1);
  opacity.push(0.15);

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ delay: until, duration: 0.18 }}
      >
        <AlarmBeam from={-34} to={26} />
        <AlarmBeam from={34} to={-26} />
        <motion.div
          className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,32,48,0.62)_0%,rgba(255,32,48,0)_60%)]"
          animate={{ opacity }}
          transition={{ duration: until, times, ease: "linear" }}
        />
        <AlarmLamp className="top-[max(1.25rem,env(safe-area-inset-top))] left-5" />
        <AlarmLamp className="top-[max(1.25rem,env(safe-area-inset-top))] right-5" />
      </motion.div>
    </div>
  );
}

function AlarmBeam({ from, to }: { from: number; to: number }) {
  return (
    <motion.div
      className="absolute top-[-8%] left-[38%] h-[130%] w-[24%] origin-top"
      style={{
        background:
          "linear-gradient(90deg, transparent 0%, rgba(255,32,48,0.05) 28%, rgba(255,64,72,0.55) 46%, rgba(255,228,220,0.85) 50%, rgba(255,64,72,0.55) 54%, rgba(255,32,48,0.05) 72%, transparent 100%)",
      }}
      initial={{ rotate: from }}
      animate={{ rotate: [from, to] }}
      transition={{ duration: 0.7, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
    />
  );
}

function AlarmLamp({ className }: { className: string }) {
  return (
    <span className={`absolute h-4 w-4 ${className}`}>
      <motion.span
        className="absolute inset-0 rounded-full border-2 border-[#ff4d57]"
        animate={{ opacity: [0.8, 0], scale: [1, 2.6] }}
        transition={{ duration: CHALLENGER_ALARM_STEP * 2, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.span
        className="absolute inset-0 rounded-full bg-[#ff2d3a] shadow-[0_0_22px_10px_rgba(255,45,58,0.95)]"
        animate={{ opacity: [1, 0.4, 1], scale: [1, 0.82, 1] }}
        transition={{ duration: CHALLENGER_ALARM_STEP * 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </span>
  );
}

function ArenaImpact({ still, delay }: { still: boolean; delay: number }) {
  return (
    <>
      <motion.svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        initial={still ? false : { opacity: 0 }}
        animate={still ? { opacity: 0.9 } : { opacity: [0, 1, 0.75] }}
        transition={still ? { duration: 0 } : { duration: 0.6, delay }}
      >
        <line x1="57" y1="0" x2="37" y2="100" stroke="#FFE07A" strokeWidth="1.6" opacity="0.35" vectorEffect="non-scaling-stroke" />
        <line x1="57" y1="0" x2="37" y2="100" stroke="#ffffff" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      </motion.svg>
      {still ? null : (
        <motion.div
          className="absolute inset-0 bg-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.55, 0] }}
          transition={{ duration: 0.35, delay: delay + 0.05, times: [0, 0.2, 1] }}
        />
      )}
    </>
  );
}

export function Fighter({
  side,
  initial,
  name,
  role,
  colors,
  still,
  stageClassName,
}: {
  side: "left" | "right";
  initial: string;
  name: string;
  role: string;
  colors: { face: string; lip: string; wash: string };
  still: boolean;
  /** Centers the avatar in a box this tall, to line up with a taller neighbor. */
  stageClassName?: string;
}) {
  const from = side === "left" ? -180 : 180;
  const avatar = (
    <motion.div
      className="relative"
      animate={still ? undefined : { y: [0, -5, 0] }}
      transition={
        still
          ? undefined
          : { duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: BEAT.cta + (side === "left" ? 0 : 0.5) }
      }
    >
      <span
        className="absolute -inset-3 rounded-[36px] blur-xl"
        style={{ backgroundColor: colors.face, opacity: 0.55 }}
      />
      <span
        className="relative flex h-[92px] w-[92px] items-center justify-center rounded-[30px] bg-white text-[42px] font-extrabold leading-none [@media(max-height:700px)]:h-[76px] [@media(max-height:700px)]:w-[76px] [@media(max-height:700px)]:text-[34px] sm:h-[104px] sm:w-[104px]"
        style={{
          color: colors.face,
          boxShadow: `0 0 0 4px ${colors.face}, 0 7px 0 4px ${colors.lip}`,
        }}
      >
        {initial}
      </span>
      {side === "left" ? <SwordsBadge /> : null}
    </motion.div>
  );
  return (
    <motion.div
      className="flex min-w-0 flex-col items-center text-center"
      initial={still ? false : { x: from, opacity: 0, rotate: side === "left" ? -12 : 12 }}
      animate={{ x: 0, opacity: 1, rotate: 0 }}
      transition={
        still ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 17, delay: BEAT.fighters }
      }
    >
      {stageClassName ? (
        <div className={`flex items-center justify-center ${stageClassName}`}>{avatar}</div>
      ) : (
        avatar
      )}
      <span
        className={`${stageClassName ? "mt-2" : "mt-5"} w-full truncate px-1 text-[17px] font-extrabold [text-shadow:0_2px_0_rgba(0,0,0,0.3)]`}
      >
        {name}
      </span>
      <span
        className="mt-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider"
        style={{ backgroundColor: colors.wash, color: colors.lip }}
      >
        {role}
      </span>
    </motion.div>
  );
}

/** The gold crossed-swords pin on the challenger's corner. */
export function SwordsBadge({ className = "absolute -top-2 -right-2" }: { className?: string }) {
  return (
    <span
      className={`${className} flex h-8 w-8 items-center justify-center rounded-full bg-[#FFC83D] text-[#7c2d12] shadow-[0_3px_0_0_#c98a00]`}
      aria-hidden="true"
    >
      <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>
        swords
      </span>
    </span>
  );
}

export function VsBadge({ still, delay = BEAT.vs }: { still: boolean; delay?: number }) {
  return (
    <div className="relative flex h-[92px] w-16 items-center justify-center [@media(max-height:700px)]:h-[76px] sm:h-[104px] sm:w-20">
      {still ? null : (
        <>
          <motion.span
            className="absolute h-16 w-16 rounded-full border-4 border-[#FFE07A]"
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 1, 0], scale: [0.3, 1, 3] }}
            transition={{ duration: 0.7, ease: "easeOut", delay: delay + 0.05 }}
            aria-hidden="true"
          />
          {SPARKS.map((spark, index) => (
            <motion.span
              key={index}
              className="absolute h-1.5 w-4 rounded-full"
              style={{ backgroundColor: spark.color, rotate: spark.rotate }}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{ x: [0, spark.x], y: [0, spark.y], opacity: [1, 0], scale: [1, 0.6] }}
              transition={{ duration: 0.65, ease: "easeOut", delay: delay + 0.05 }}
              aria-hidden="true"
            />
          ))}
        </>
      )}
      <motion.span
        className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-b from-[#FFE07A] to-[#FFB020] text-[26px] font-black italic tracking-tight text-[#7c2d12] shadow-[0_5px_0_0_#c2410c,0_0_28px_rgba(255,200,61,0.75)] sm:h-20 sm:w-20 sm:text-[32px]"
        initial={still ? false : { scale: 3.2, opacity: 0, rotate: -40 }}
        animate={{ scale: 1, opacity: 1, rotate: -8 }}
        transition={still ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 15, delay }}
      >
        VS
      </motion.span>
    </div>
  );
}

export function Chip({
  icon,
  filled = false,
  tone = "glass",
  children,
}: {
  icon: string;
  filled?: boolean;
  tone?: "glass" | "gold";
  children: ReactNode;
}) {
  return (
    <li
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-extrabold ${
        tone === "gold"
          ? "bg-[#FFC83D] text-[#5c3200] shadow-[0_3px_0_0_#c98a00]"
          : "bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-sm"
      }`}
    >
      <span
        className="material-symbols-outlined text-[16px]"
        style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
        aria-hidden="true"
      >
        {icon}
      </span>
      {children}
    </li>
  );
}

export function ButtonShine({ delay = BEAT.cta + 0.3 }: { delay?: number }) {
  return (
    <motion.span
      className="pointer-events-none absolute inset-y-0 left-0 w-1/4 -skew-x-12 bg-gradient-to-r from-transparent via-white/45 to-transparent"
      initial={{ x: "-150%" }}
      animate={{ x: "500%" }}
      transition={{ duration: 1.1, delay, repeat: Infinity, repeatDelay: 1.8, ease: "easeInOut" }}
      aria-hidden="true"
    />
  );
}
