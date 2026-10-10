"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  useVelocity,
} from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { chunkyButton } from "@/components/chunkyButton";
import {
  Arena,
  ButtonShine,
  CHALLENGER,
  Chip,
  Fighter,
  SwordsBadge,
  VsBadge,
  YOU,
} from "@/components/DuelChallengeIntro";
import {
  DUEL_LOSS_XP,
  DUEL_SIZE,
  DUEL_WIN_XP,
  nameInitial,
  opponentReel,
  placeOnReel,
  reelStop,
} from "@/lib/duels";
import { playReelLockSound, playReelTickSound } from "@/lib/sfx";

export type MatchedDuel = { id: string; opponentName: string };

const TILE = 92;
const GAP = 10;
const PITCH = TILE + GAP;
/** How much of the names above and below shows through the reel window. */
const PEEK = 30;
const WINDOW = TILE + PEEK * 2;

/** Slots per second at full speed. */
const SPIN_SPEED = 16;
const SPIN_UP_SECONDS = 0.35;
/** The reel spins at least this long, even when the server answers at once. */
const MIN_SPIN_SECONDS = 1.3;
/** The fewest slots the reel passes while slowing down. */
const LAND_SLOTS = 8;
/** Starts at the spin speed (a slope of 3) and settles a little past the stop. */
const LAND_EASE = [0.2, 0.6, 0.35, 1.04] as const;
/** How long the reveal stays up before the duel opens on its own. */
const HOLD_SECONDS = 2.4;
const TICK_GAP_MS = 45;

function wrap(value: number, length: number): number {
  return ((value % length) + length) % length;
}

/**
 * A slot-machine reel of classmates that spins while the server picks an
 * opponent, then slows down and locks on them in the challenge showdown's
 * arena. The duel opens on its own a moment after the lock.
 */
export function DuelMatchmaking({
  rivals,
  yourInitial,
  match,
  onEnter,
}: {
  rivals: readonly string[];
  yourInitial: string;
  /** The created duel, once the server has picked the opponent. */
  match: MatchedDuel | null;
  /** Keep this stable: a new function restarts the wait before the duel opens. */
  onEnter: (match: MatchedDuel) => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [startReel] = useState(() => opponentReel(rivals, Math.random));
  const [placedReel, setPlacedReel] = useState<string[] | null>(null);
  const [landed, setLanded] = useState<MatchedDuel | null>(null);
  const [entering, setEntering] = useState(false);
  const reel = placedReel ?? startReel;
  const length = reel.length;

  const slot = useMotionValue(0);
  const y = useTransform(slot, (value) => PEEK - (length + wrap(value, length)) * PITCH);
  const speed = useVelocity(slot);
  const blur = useTransform(speed, (value) => `blur(${Math.min(Math.abs(value) / SPIN_SPEED, 1) * 1.4}px)`);

  const spinningRef = useRef(true);
  const startedRef = useRef(0);
  const landingRef = useRef(false);
  const tickRef = useRef({ slot: 0, at: 0 });

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Spin up and keep spinning until the landing takes over.
  useEffect(() => {
    startedRef.current = performance.now();
    if (reduceMotion) return;
    let frame = 0;
    let last = startedRef.current;
    const step = (now: number) => {
      if (!spinningRef.current) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const ramp = Math.min(1, (now - startedRef.current) / 1000 / SPIN_UP_SECONDS);
      slot.set(slot.get() + SPIN_SPEED * ramp * ramp * dt);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, slot]);

  useMotionValueEvent(slot, "change", (value) => {
    const passed = Math.round(value);
    const now = performance.now();
    if (passed === tickRef.current.slot || now - tickRef.current.at < TICK_GAP_MS) return;
    tickRef.current = { slot: passed, at: now };
    playReelTickSound();
  });

  // Slow down onto the picked classmate once the server answers.
  useEffect(() => {
    if (!match || landingRef.current) return;
    landingRef.current = true;
    let stop: (() => void) | null = null;
    const elapsed = (performance.now() - startedRef.current) / 1000;
    const wait = reduceMotion ? 0 : Math.max(0, MIN_SPIN_SECONDS - elapsed);
    const timer = window.setTimeout(() => {
      spinningRef.current = false;
      const from = slot.get();
      const placed = placeOnReel(startReel, match.opponentName, from);
      setPlacedReel(placed.reel);
      const lock = () => {
        playReelLockSound();
        setLanded(match);
      };
      if (reduceMotion) {
        slot.set(placed.index);
        lock();
        return;
      }
      const target = reelStop(from, placed.index, placed.reel.length, LAND_SLOTS);
      const duration = Math.min(2.2, Math.max(1.4, (3 * (target - from)) / SPIN_SPEED));
      const controls = animate(slot, target, { duration, ease: LAND_EASE });
      stop = () => controls.stop();
      void controls.then(lock);
    }, wait * 1000);
    return () => {
      window.clearTimeout(timer);
      stop?.();
    };
  }, [match, reduceMotion, slot, startReel]);

  const enter = () => {
    if (!landed || entering) return;
    setEntering(true);
    onEnter(landed);
  };

  useEffect(() => {
    if (!landed || entering) return;
    const timer = window.setTimeout(() => {
      setEntering(true);
      onEnter(landed);
    }, HOLD_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, [landed, entering, onEnter]);

  const strip = [...reel, ...reel, ...reel];
  const opponentName = landed?.opponentName ?? null;

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="duel-matchmaking-title"
      tabIndex={-1}
      className="fixed inset-0 z-[110] overflow-x-hidden overflow-y-auto bg-[#070b24] text-white outline-none"
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.04 }}
      transition={{ duration: reduceMotion ? 0.15 : 0.25 }}
    >
      <Arena still={reduceMotion} impactAt={landed ? 0 : null} />

      <motion.div
        className="relative mx-auto flex min-h-full w-full max-w-md flex-col px-5 pt-safe pb-safe"
        animate={landed && !reduceMotion ? { x: [0, -9, 8, -5, 3, 0] } : { x: 0 }}
        transition={{ duration: 0.45, delay: 0.05 }}
      >
        <p className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-white/90 ring-1 ring-white/15">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            {landed ? "swords" : "casino"}
          </span>
          <span aria-live="polite">{landed ? "Đã tìm thấy đối thủ" : "Đang tìm đối thủ"}</span>
        </p>

        <div className="min-h-6 flex-1" />

        <div className="relative grid grid-cols-[1fr_auto_1fr] items-start gap-1 sm:gap-3">
          <div className="flex min-w-0 flex-col items-center text-center">
            <motion.div
              className="relative"
              style={{ width: TILE + 12, height: WINDOW }}
              initial={reduceMotion ? false : { x: -180, opacity: 0, rotate: -12 }}
              animate={{ x: 0, opacity: 1, rotate: 0 }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 260, damping: 17, delay: 0.3 }}
              aria-hidden="true"
            >
              <span
                className="absolute inset-x-0 top-[22px] h-[108px] rounded-[36px] blur-xl"
                style={{ backgroundColor: CHALLENGER.face, opacity: 0.55 }}
              />
              <motion.div
                className="absolute inset-0 overflow-hidden rounded-[30px] bg-black/30 ring-1 ring-white/15"
                style={{
                  maskImage: "linear-gradient(to bottom, transparent 0, #000 24%, #000 76%, transparent 100%)",
                  WebkitMaskImage: "linear-gradient(to bottom, transparent 0, #000 24%, #000 76%, transparent 100%)",
                }}
                animate={{ opacity: landed ? 0 : 1 }}
                transition={{ duration: 0.3 }}
              >
                {reduceMotion && !landed ? (
                  <div className="absolute inset-x-[6px] flex items-center justify-center" style={{ top: PEEK, height: TILE }}>
                    <ReelTile name="?" />
                  </div>
                ) : (
                  <motion.div
                    className="absolute top-0 left-[6px] flex flex-col"
                    style={{ y, filter: reduceMotion ? undefined : blur, gap: GAP }}
                  >
                    {strip.map((name, index) => (
                      <ReelTile key={index} name={name} />
                    ))}
                  </motion.div>
                )}
              </motion.div>
              <Payline locked={landed != null} still={reduceMotion} />
              {opponentName ? <LockedTile name={opponentName} still={reduceMotion} /> : null}
            </motion.div>
            <div className="mt-2 flex h-[25px] w-full items-center justify-center">
              <AnimatePresence mode="wait" initial={false}>
                {opponentName ? (
                  <motion.span
                    key="name"
                    className="w-full truncate px-1 text-[17px] font-extrabold [text-shadow:0_2px_0_rgba(0,0,0,0.3)]"
                    initial={reduceMotion ? false : { opacity: 0, scale: 1.8, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 15 }}
                  >
                    {opponentName}
                  </motion.span>
                ) : (
                  <motion.span
                    key="mystery"
                    className="text-[17px] font-extrabold tracking-[0.3em] text-white/55"
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: 0.12 }}
                  >
                    ???
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
            <span
              className="mt-1 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider transition-opacity duration-300"
              style={{ backgroundColor: CHALLENGER.wash, color: CHALLENGER.lip, opacity: landed ? 1 : 0.55 }}
            >
              {landed ? "Đối thủ" : "Đang chọn"}
            </span>
          </div>

          <div className="flex items-center justify-center" style={{ height: WINDOW }}>
            {landed ? <VsBadge still={reduceMotion} delay={0.05} /> : <PendingVs still={reduceMotion} />}
          </div>

          <Fighter
            side="right"
            initial={yourInitial}
            name="Bạn"
            role="Thách đấu"
            colors={YOU}
            still={reduceMotion}
            stageClassName="h-[152px]"
          />
        </div>

        <div className="mt-6 min-h-[118px] [@media(max-height:700px)]:mt-4">
          <AnimatePresence mode="wait" initial={false}>
            {opponentName ? (
              <motion.div key="found">
                <motion.h2
                  id="duel-matchmaking-title"
                  className="text-center text-[30px] leading-[1.15] font-extrabold tracking-tight [text-shadow:0_3px_0_rgba(0,0,0,0.35)] [@media(max-height:700px)]:text-[26px] sm:text-[34px]"
                  initial={reduceMotion ? false : { opacity: 0, scale: 1.6, filter: "blur(6px)" }}
                  animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                  transition={
                    reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 16, delay: 0.2 }
                  }
                >
                  Bạn thách đấu <span className="break-words">{opponentName}</span>!
                </motion.h2>
                <motion.ul
                  className="mt-4 flex flex-wrap items-center justify-center gap-2"
                  initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : 0.45, duration: 0.3 }}
                >
                  <Chip icon="bolt" filled tone="gold">
                    Thắng +{DUEL_WIN_XP} XP
                  </Chip>
                  <Chip icon="quiz">{DUEL_SIZE} câu</Chip>
                </motion.ul>
              </motion.div>
            ) : (
              <motion.div key="searching" exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
                <h2
                  id="duel-matchmaking-title"
                  className="text-center text-[30px] leading-[1.15] font-extrabold tracking-tight [text-shadow:0_3px_0_rgba(0,0,0,0.35)] [@media(max-height:700px)]:text-[26px] sm:text-[34px]"
                >
                  Ai sẽ là đối thủ?
                </h2>
                <p className="mt-2 text-center text-[15px] font-semibold leading-snug text-white/80">
                  Đang chọn ngẫu nhiên một bạn cùng lớp. Thua vẫn được +{DUEL_LOSS_XP} XP.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="min-h-8 flex-1" />

        <div className="flex flex-col items-center gap-1 pt-2 pb-6">
          <button
            type="button"
            onClick={enter}
            disabled={!landed || entering}
            className={chunkyButton(landed && !entering ? "success" : "disabled", "relative w-full overflow-hidden text-[17px]")}
          >
            {landed && !entering && !reduceMotion ? (
              <>
                <motion.span
                  className="pointer-events-none absolute inset-0 origin-left bg-white/20"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: HOLD_SECONDS, ease: "linear" }}
                  aria-hidden="true"
                />
                <ButtonShine delay={0.3} />
              </>
            ) : null}
            <span className="material-symbols-outlined relative text-[22px]" aria-hidden="true">
              swords
            </span>
            <span className="relative">
              {!landed ? "Đang tìm..." : entering ? "Đang vào trận..." : "Vào trận"}
            </span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ReelTile({ name }: { name: string }) {
  return (
    <span
      className="flex shrink-0 flex-col items-center justify-center rounded-[26px] bg-white px-1.5"
      style={{ width: TILE, height: TILE, color: CHALLENGER.face }}
    >
      <span className="text-[38px] leading-none font-extrabold">{nameInitial(name)}</span>
      {name === "?" ? null : (
        <span className="mt-1 w-full truncate text-[11px] font-extrabold text-[#64748b]">{name}</span>
      )}
    </span>
  );
}

/** The gold frame the names roll through. It turns into the challenger's ring on the lock. */
function Payline({ locked, still }: { locked: boolean; still: boolean }) {
  const top = PEEK - 6;
  return (
    <>
      <motion.span
        className="pointer-events-none absolute left-0 rounded-[32px] border-4 border-[#FFC83D]"
        style={{ top, width: TILE + 12, height: TILE + 12 }}
        animate={
          locked
            ? { opacity: 0, scale: 1.25 }
            : still
              ? { opacity: 1 }
              : { opacity: 1, boxShadow: ["0 0 10px rgba(255,200,61,0.45)", "0 0 22px rgba(255,200,61,0.9)", "0 0 10px rgba(255,200,61,0.45)"] }
        }
        transition={locked ? { duration: 0.35 } : { duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
      />
      {(["left", "right"] as const).map((side) => (
        <motion.span
          key={side}
          className="pointer-events-none absolute h-0 w-0 border-y-[9px] border-y-transparent"
          style={
            side === "left"
              ? { top: PEEK + TILE / 2 - 9, left: -10, borderLeft: "11px solid #FFC83D" }
              : { top: PEEK + TILE / 2 - 9, right: -10, borderRight: "11px solid #FFC83D" }
          }
          animate={{ opacity: locked ? 0 : 1 }}
          transition={{ duration: 0.2 }}
        />
      ))}
    </>
  );
}

/** The picked classmate, popped out of the reel in the showdown's fighter style. */
function LockedTile({ name, still }: { name: string; still: boolean }) {
  return (
    <motion.span
      className="absolute left-[6px]"
      style={{ top: PEEK, width: TILE, height: TILE }}
      initial={still ? false : { scale: 1.25 }}
      animate={{ scale: 1 }}
      transition={still ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 13 }}
    >
      <span
        className="flex h-full w-full items-center justify-center rounded-[30px] bg-white text-[42px] leading-none font-extrabold"
        style={{
          color: CHALLENGER.face,
          boxShadow: `0 0 0 4px ${CHALLENGER.face}, 0 7px 0 4px ${CHALLENGER.lip}`,
        }}
      >
        {nameInitial(name)}
      </span>
      <motion.span
        className="absolute -top-2 -right-2 h-8 w-8"
        initial={still ? false : { scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={still ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 14, delay: 0.25 }}
      >
        <SwordsBadge className="absolute inset-0" />
      </motion.span>
    </motion.span>
  );
}

/** A dim VS while the reel spins, before the real one slams in. */
function PendingVs({ still }: { still: boolean }) {
  return (
    <div className="relative flex h-[92px] w-16 items-center justify-center sm:w-20">
      <motion.span
        className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-[22px] font-black italic tracking-tight text-white/45 ring-2 ring-white/20"
        animate={still ? undefined : { scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={still ? undefined : { duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
      >
        VS
      </motion.span>
    </div>
  );
}
