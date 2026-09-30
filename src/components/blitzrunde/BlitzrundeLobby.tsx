"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BLITZRUNDE_DURATION_MS,
  MIN_RANKED,
  SPEED_FLOOR,
  SPEED_WINDOW_MS,
  STREAK_CAP,
  STREAK_STEP,
} from "@/lib/blitzrunde";
import type { StudentRoundView } from "@/lib/blitzrunde-store";

const AVATAR_COLORS = ["#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948", "#0f766e"];
const TIP_MS = 5000;

const TIPS: { icon: string; title: string; body: string }[] = [
  {
    icon: "⚡",
    title: "Nhanh = nhiều điểm",
    body: `Trả lời ngay được trọn 1.000 điểm. Sau ${SPEED_WINDOW_MS / 1000} giây chỉ còn ${Math.round(SPEED_FLOOR * 100)}%.`,
  },
  {
    icon: "🔥",
    title: "Giữ chuỗi đúng",
    body: `Mỗi câu đúng liên tiếp +${Math.round(STREAK_STEP * 100)}%, tối đa +${Math.round(STREAK_CAP * STREAK_STEP * 100)}%. Sai một câu là chuỗi về 0.`,
  },
  { icon: "🧩", title: "Ghép từ cẩn thận", body: "Mỗi cặp ghép sai trừ 1/5 số điểm của thẻ đó." },
  { icon: "👆", title: "Mỗi thẻ chỉ một lần", body: "Không làm lại được — chắc tay rồi mới bấm Kiểm tra." },
  { icon: "📵", title: "Đừng tải lại trang", body: "Giữ app mở suốt vòng chơi, nếu không điểm vòng này sẽ mất." },
  { icon: "🥇", title: "Lên bục vinh quang", body: "Top 3 nhận huy chương vàng, bạc, đồng trên bảng Blitzrunde của lớp." },
];

const TAP_MILESTONES: [number, string][] = [
  [100, "Bình tĩnh nào, để dành sức! 😄"],
  [50, "Sẵn sàng vô địch! 🏆"],
  [25, "Tay nhanh quá! ⚡"],
  [10, "Nóng máy rồi! 🔥"],
  [1, "Khởi động ngón tay…"],
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash + name.charCodeAt(index) * (index + 1)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash] ?? AVATAR_COLORS[0]!;
}

function initialFor(name: string): string {
  return Array.from(name)[0]?.toLocaleUpperCase("vi") ?? "?";
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[28px] bg-white p-4 shadow-[0_4px_0_0_#e2e7ff] ${className}`}>{children}</section>;
}

function WaitingDots({ still }: { still: boolean }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-current"
          animate={still ? undefined : { y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
          transition={still ? undefined : { duration: 0.9, repeat: Infinity, delay: index * 0.15 }}
        />
      ))}
    </span>
  );
}

function Hero({ round, still }: { round: StudentRoundView; still: boolean }) {
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#f59e0b] to-[#fbbf24] px-5 pb-5 pt-6 text-center text-white shadow-[0_6px_0_0_#b45309]">
      <span className="pointer-events-none absolute -left-6 -top-6 h-24 w-24 rounded-full bg-white/15" aria-hidden="true" />
      <span className="pointer-events-none absolute -bottom-8 -right-4 h-28 w-28 rounded-full bg-white/10" aria-hidden="true" />
      <motion.span
        className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-white text-[44px] shadow-[0_5px_0_0_#d97706]"
        animate={still ? undefined : { y: [0, -8, 0], rotate: [0, -6, 6, 0] }}
        transition={still ? undefined : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      >
        ⚡
      </motion.span>
      <p className="relative mt-3 text-[28px] font-extrabold leading-none tracking-tight">Blitzrunde</p>
      <p className="relative mt-1.5 text-[15px] font-extrabold text-amber-50">
        {round.meta.levelLabel} · {round.meta.lektionLabel}
      </p>
      <p className="relative text-[13px] font-bold text-amber-100">{round.meta.classLabel}</p>
      <p className="relative mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-white/25 px-4 py-2 text-[14px] font-extrabold">
        Chờ giáo viên bắt đầu
        <WaitingDots still={still} />
      </p>
    </section>
  );
}

function Players({ round, still }: { round: StudentRoundView; still: boolean }) {
  const players = round.players ?? [];
  const count = players.length || round.joinedCount;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-extrabold uppercase tracking-wider text-[#6e7881]">Người chơi</p>
        <motion.span
          key={count}
          className="rounded-full bg-[#e0f2fe] px-2.5 py-0.5 text-[14px] font-extrabold tabular-nums text-[#0284c7]"
          initial={still ? false : { scale: 1.4 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 15 }}
        >
          {count}
        </motion.span>
      </div>
      <ul className="mt-3 grid grid-cols-4 gap-x-2 gap-y-3">
        <AnimatePresence initial={false}>
          {players.map((player) => (
            <motion.li
              key={`${player.name}-${player.joinedAt}`}
              className="relative flex flex-col items-center"
              initial={still ? false : { scale: 0, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 520, damping: 18 }}
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full text-[22px] font-extrabold text-white shadow-[0_3px_0_0_rgba(0,0,0,0.15)] ${
                  player.isYou ? "ring-4 ring-[#7dd3fc]" : ""
                }`}
                style={{ backgroundColor: player.isYou ? "#0284c7" : avatarColor(player.name) }}
              >
                {initialFor(player.name)}
              </span>
              {still ? null : (
                <motion.span
                  className="absolute -top-2 right-0 rounded-full bg-[#22c55e] px-1.5 text-[11px] font-extrabold text-white"
                  initial={{ opacity: 1, y: 0 }}
                  animate={{ opacity: 0, y: -14 }}
                  transition={{ duration: 1.2, delay: 0.4 }}
                  aria-hidden="true"
                >
                  +1
                </motion.span>
              )}
              <span className="mt-1 w-full truncate text-center text-[12px] font-extrabold text-[#131b2e]">
                {player.isYou ? "Bạn" : player.name}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {count < MIN_RANKED ? (
        <p className="mt-3 rounded-2xl bg-[#f1f3ff] px-3 py-2.5 text-[13px] font-bold leading-snug text-[#6e7881]">
          Mời bạn cùng lớp vào nào! Cần từ {MIN_RANKED} người để vòng này được tính lên bảng xếp hạng.
        </p>
      ) : null}
    </Card>
  );
}

function DeckPreview({ round }: { round: StudentRoundView }) {
  const { counts, deckSize } = round.meta;
  const tiles = [
    { label: "Chọn nghĩa", value: counts["multiple-choice"], emoji: "🔤", tone: "bg-[#e0f2fe] text-[#0369a1]" },
    { label: "Sắp xếp câu", value: counts.order, emoji: "🧱", tone: "bg-[#fef3c7] text-[#b45309]" },
    { label: "Ghép từ", value: counts.pairing, emoji: "🧩", tone: "bg-[#dcfce7] text-[#15803d]" },
  ];
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-extrabold uppercase tracking-wider text-[#6e7881]">Hôm nay chơi gì</p>
        <p className="text-[13px] font-extrabold text-[#131b2e]">
          {deckSize} thẻ · {Math.round(BLITZRUNDE_DURATION_MS / 60_000)} phút
        </p>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className={`flex flex-col items-center rounded-2xl px-2 py-3 ${tile.tone}`}>
            <span className="text-[24px] leading-none" aria-hidden="true">
              {tile.emoji}
            </span>
            <span className="mt-1 text-[20px] font-extrabold tabular-nums">{tile.value}</span>
            <span className="text-center text-[11px] font-extrabold leading-tight">{tile.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Tips({ still }: { still: boolean }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % TIPS.length), TIP_MS);
    return () => window.clearInterval(timer);
  }, []);
  const tip = TIPS[index] ?? TIPS[0]!;
  return (
    <Card className="bg-[#fffbeb] shadow-[0_4px_0_0_#fde68a]">
      <p className="text-[13px] font-extrabold uppercase tracking-wider text-[#b45309]">Mẹo nhỏ</p>
      <div className="relative mt-2 min-h-[72px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={index}
            className="flex items-start gap-3"
            initial={still ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={still ? { opacity: 0 } : { opacity: 0, x: -24 }}
            transition={{ duration: 0.25 }}
          >
            <span className="text-[32px] leading-none" aria-hidden="true">
              {tip.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-[16px] font-extrabold text-[#131b2e]">{tip.title}</span>
              <span className="mt-0.5 block text-[14px] font-bold leading-snug text-[#6e7881]">{tip.body}</span>
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
        {TIPS.map((entry, dot) => (
          <button
            key={entry.title}
            type="button"
            tabIndex={-1}
            onClick={() => setIndex(dot)}
            className={`h-2 rounded-full transition-all ${dot === index ? "w-5 bg-[#f59e0b]" : "w-2 bg-[#fde68a]"}`}
          />
        ))}
      </div>
    </Card>
  );
}

function WarmUp({ still }: { still: boolean }) {
  const [taps, setTaps] = useState(0);
  const label = TAP_MILESTONES.find(([at]) => taps >= at)?.[1] ?? "Chạm để khởi động!";
  return (
    <Card className="flex items-center gap-4">
      <div className="relative">
        <motion.button
          type="button"
          onClick={() => setTaps((count) => count + 1)}
          whileTap={still ? undefined : { scale: 0.82, rotate: -8 }}
          className="flex h-20 w-20 items-center justify-center rounded-[24px] bg-[#0284c7] text-[40px] shadow-[0_5px_0_0_#0369a1] active:translate-y-1 active:shadow-none"
          aria-label="Chạm để khởi động"
        >
          <span aria-hidden="true">⚡</span>
        </motion.button>
        <AnimatePresence>
          {taps > 0 && !still ? (
            <motion.span
              key={taps}
              className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 text-[16px] font-extrabold text-[#0284c7]"
              initial={{ opacity: 1, y: 0 }}
              animate={{ opacity: 0, y: -36 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              aria-hidden="true"
            >
              +1
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-extrabold uppercase tracking-wider text-[#6e7881]">Khởi động</p>
        <motion.p
          key={taps}
          className="text-[32px] font-extrabold leading-none tabular-nums text-[#131b2e]"
          initial={still || taps === 0 ? false : { scale: 1.25 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 600, damping: 14 }}
        >
          {taps}
        </motion.p>
        <p className="mt-1 text-[13px] font-bold text-[#6e7881]">{label}</p>
      </div>
    </Card>
  );
}

/** What a student sees after joining, until the teacher starts the round. */
export function BlitzrundeLobby({ round }: { round: StudentRoundView }) {
  const still = useReducedMotion() ?? false;
  return (
    <div className="flex flex-col gap-4 pb-4">
      <Hero round={round} still={still} />
      <Players round={round} still={still} />
      <DeckPreview round={round} />
      <Tips still={still} />
      <WarmUp still={still} />
    </div>
  );
}

const COUNTDOWN_STEPS = ["3", "2", "1", "Bắt đầu!"];
export const COUNTDOWN_STEP_MS = 600;

/** "3 · 2 · 1 · Bắt đầu!" between the teacher's start and the first card; the card timer starts after it. */
export function BlitzrundeCountdown({ onDone }: { onDone: () => void }) {
  const still = useReducedMotion() ?? false;
  const [step, setStep] = useState(0);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (step + 1 < COUNTDOWN_STEPS.length) setStep(step + 1);
      else doneRef.current();
    }, COUNTDOWN_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [step]);
  const label = COUNTDOWN_STEPS[step] ?? "";
  const last = step === COUNTDOWN_STEPS.length - 1;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-[#f59e0b] to-[#fbbf24] text-white"
      role="status"
      aria-live="assertive"
    >
      <p className="text-[15px] font-extrabold uppercase tracking-wider text-amber-50">Chuẩn bị</p>
      <div className="relative mt-4 flex h-44 w-full items-center justify-center">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={step}
            className={`absolute font-extrabold leading-none drop-shadow-[0_6px_0_rgba(180,83,9,0.6)] ${
              last ? "text-[56px]" : "text-[140px] tabular-nums"
            }`}
            initial={still ? false : { scale: 2.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={still ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
            transition={still ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 20 }}
          >
            {label}
          </motion.span>
        </AnimatePresence>
      </div>
      <p className="mt-4 text-[15px] font-bold text-amber-50">Nhanh và chính xác nhé! ⚡</p>
    </div>
  );
}
