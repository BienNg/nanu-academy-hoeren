"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SentenceOrderCard } from "@/components/session/SentenceOrderCard";
import { ChillPingu } from "@/components/session/Pingu";
import { chunkyButton } from "@/components/chunkyButton";
import { DUEL_LOSS_XP, DUEL_SIZE, DUEL_TIE_XP, DUEL_WIN_XP, formatDuelTime } from "@/lib/duels";

const DEMO_CHIPS = [
  { id: "heisse", text: "heiße" },
  { id: "ich", text: "Ich" },
  { id: "anna", text: "Anna" },
];

/** Marks a picture of a real screen. The learner cannot tap it. */
function ExampleLook({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none relative mt-4 w-full rounded-[28px] border border-dashed border-[#d5dde6] bg-[#f7f8fb] px-3 pt-4 pb-3 text-left" aria-hidden="true">
      <span className="absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 bg-[#faf8ff] px-1.5 text-[10px] leading-none font-bold tracking-wide text-[#94a3b8]">
        Ví dụ · chỉ để xem
      </span>
      {children}
    </div>
  );
}

/** Both players get this card. Locked, so it only shows how a sentence looks. */
function SameSentenceDemo() {
  return (
    <ExampleLook>
      <SentenceOrderCard
        eyebrow="Câu 1/15"
        instruction="Cả hai cùng dịch câu này"
        translation="Tôi tên là Anna."
        chips={DEMO_CHIPS}
        locked
        onSubmit={() => {}}
      />
    </ExampleLook>
  );
}

/** A few finished sentences, so the faster time is easy to see. */
function FasterWinsDemo({ opponentName }: { opponentName: string }) {
  const rounds = [
    { sentence: "Ich heiße Anna.", you: 8200, them: 11400 },
    { sentence: "Guten Morgen.", you: 6400, them: 5100 },
    { sentence: "Danke schön.", you: 4300, them: 9100 },
  ];
  return (
    <ExampleLook>
      <div className="flex w-full flex-col gap-2">
        {rounds.map((round) => {
          const youWon = round.you < round.them;
          const sides = [
            { name: "Bạn", time: formatDuelTime(round.you), won: youWon },
            { name: opponentName, time: formatDuelTime(round.them), won: !youWon },
          ];
          return (
            <section key={round.sentence} className="rounded-2xl bg-white px-4 py-3 shadow-[0_3px_0_0_#dae2fd]">
              <p className="text-[15px] font-extrabold text-[#131b2e]">{round.sentence}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {sides.map((side) => (
                  <div
                    key={side.name}
                    className={`min-w-0 rounded-2xl px-2 py-2 text-center ${
                      side.won ? "bg-[#e0f2fe] shadow-[0_3px_0_0_#7dd3fc]" : "bg-[#f8fafc]"
                    }`}
                  >
                    <p className={`truncate text-[12px] font-extrabold ${side.won ? "text-[#0284c7]" : "text-[#6e7881]"}`}>
                      {side.name}
                    </p>
                    <p
                      className={`mt-1 text-[18px] font-extrabold tabular-nums ${side.won ? "text-[#0284c7]" : "text-[#131b2e]"}`}
                    >
                      {side.time}
                    </p>
                    <p className={`mt-0.5 text-[11px] font-extrabold ${side.won ? "text-[#0284c7]" : "invisible"}`}>
                      Nhanh hơn
                    </p>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </ExampleLook>
  );
}

const ONBOARDING_STEPS = [
  {
    pose: "cups",
    icon: "swords",
    title: `Cùng ${DUEL_SIZE} câu`,
    body: (opponent: string) =>
      `Bạn và ${opponent} nhận cùng ${DUEL_SIZE} câu, lấy từ những câu cả hai đã học.`,
  },
  {
    pose: "pingpong",
    icon: "timer",
    title: "Nhanh hơn được điểm",
    body: () => "Mỗi câu, ai làm đúng nhanh hơn được 1 điểm. Sai thì sửa lại, đồng hồ vẫn chạy.",
  },
] as const;

/** The how-to before a learner's first duel. It shows once, ahead of the opponent reel. */
export function DuelOnboarding({ opponentName, onDone }: { opponentName: string; onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const step = ONBOARDING_STEPS[index]!;
  const last = index === ONBOARDING_STEPS.length - 1;

  return (
    <section className="flex flex-1 flex-col items-center pt-2 pb-2 text-center" aria-labelledby="duel-onboarding-title">
      <motion.div
        key={index}
        className="flex w-full flex-col items-center"
        initial={reduceMotion ? false : { opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 30 }}
      >
        <div className="relative flex h-[88px] items-end justify-center" aria-hidden="true">
          <div className="origin-bottom scale-[1.15]">
            <ChillPingu pose={step.pose} />
          </div>
          <span className="absolute top-1 right-[calc(50%-88px)] flex h-9 w-9 items-center justify-center rounded-2xl bg-[#0284c7] text-white shadow-[0_3px_0_0_#0369a1]">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              {step.icon}
            </span>
          </span>
        </div>
        <p className="mt-3 text-[13px] font-extrabold uppercase tracking-wider text-[#0284c7]">
          Trận đấu đầu tiên · {index + 1}/{ONBOARDING_STEPS.length}
        </p>
        <h2 id="duel-onboarding-title" className="mt-1 text-[26px] font-extrabold leading-tight tracking-tight">
          {step.title}
        </h2>
        <p className="mt-2 max-w-sm text-[16px] font-medium leading-relaxed text-[#3e4850]">{step.body(opponentName)}</p>
        {last ? (
          <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-[#fff4d6] px-3 py-1.5 text-[14px] font-extrabold text-[#d97706]">
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
              aria-hidden="true"
            >
              bolt
            </span>
            Thắng +{DUEL_WIN_XP} · Hòa +{DUEL_TIE_XP} · Thua +{DUEL_LOSS_XP} XP
          </p>
        ) : null}
        {index === 0 ? <SameSentenceDemo /> : null}
        {index === 1 ? <FasterWinsDemo opponentName={opponentName} /> : null}
      </motion.div>

      <div className="min-h-4 flex-1" />

      <div className="mt-3 flex gap-2" aria-hidden="true">
        {ONBOARDING_STEPS.map((item, dot) => (
          <span
            key={item.title}
            className={`h-2.5 rounded-full transition-[width,background-color] duration-200 ${
              dot === index ? "w-8 bg-[#0284c7]" : dot < index ? "w-2.5 bg-[#0284c7]" : "w-2.5 bg-[#e2e7ff]"
            }`}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={last ? onDone : () => setIndex(index + 1)}
        className={chunkyButton("primary", "mt-8 w-full")}
      >
        {last ? (
          <>
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              swords
            </span>
            Bắt đầu đấu
          </>
        ) : (
          "Tiếp tục"
        )}
      </button>
    </section>
  );
}
