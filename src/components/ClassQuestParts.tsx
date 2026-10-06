"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { chunkyButton } from "@/components/chunkyButton";
import { PersonAvatar } from "@/components/LeaderboardParts";
import { readClassQuestBoard, type ClassQuestBoard, type ClassQuestView } from "@/lib/class-quests";
import { formatWeekCountdown } from "@/lib/xp";

const SPRING = { type: "spring" as const, stiffness: 420, damping: 18 };
/** Avatars shown before the rest collapse into "+N". */
const AVATAR_LIMIT = 6;

function Contributors({ quest }: { quest: ClassQuestView }) {
  const shown = quest.contributors.slice(0, AVATAR_LIMIT);
  const more = quest.contributors.length - shown.length;
  if (quest.contributors.length === 0) {
    return <p className="text-[12px] font-bold text-[#86868b]">Chưa ai góp sức. Hãy là người đầu tiên!</p>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex shrink-0 -space-x-1.5">
        {shown.map((person, index) => (
          <span key={`${person.name}-${index}`} className="inline-flex overflow-hidden rounded-full ring-2 ring-white">
            <PersonAvatar name={person.name} image={person.image} size={28} />
          </span>
        ))}
        {more > 0 ? (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e5e5ea] text-[11px] font-extrabold text-[#6e6e73] ring-2 ring-white">
            +{more}
          </span>
        ) : null}
      </div>
      <p className="min-w-0 truncate text-[12px] font-bold text-[#6e6e73]">
        {quest.contributors.length} bạn đã góp sức
      </p>
    </div>
  );
}

function ClassQuestCard({
  quest,
  index,
  claiming,
  onClaim,
}: {
  quest: ClassQuestView;
  index: number;
  claiming: boolean;
  onClaim: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const percent = Math.min(100, Math.round((quest.progress / quest.target) * 100));
  const hint = quest.claimed
    ? null
    : quest.done
      ? quest.youContributed
        ? null
        : "Lớp đã xong! Luyện 1 phần để cùng nhận thưởng."
      : quest.youContributed
        ? "Bạn đã góp sức. Rủ cả lớp cùng luyện nhé!"
        : null;
  return (
    <motion.li
      className={`flex flex-col gap-3 px-4 py-4 ${index > 0 ? "border-t-2 border-[#f2f2f7]" : ""}`}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { ...SPRING, delay: 0.08 * index }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{
            backgroundColor: quest.done ? "#34C759" : "#5856D6",
            boxShadow: `0 4px 0 0 ${quest.done ? "#248a3d" : "#3634a3"}`,
          }}
        >
          <span
            className="material-symbols-outlined text-[26px] text-white"
            style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}
            aria-hidden="true"
          >
            {quest.done ? "check" : quest.icon}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-[15px] leading-5 font-extrabold ${quest.claimed ? "text-[#86868b]" : "text-[#1d1d1f]"}`}>
              {quest.title}
            </p>
            <span className="mt-px inline-flex shrink-0 items-center gap-0.5 text-[13px] font-extrabold text-[#f59e0b]">
              <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
                bolt
              </span>
              {quest.xp}
            </span>
          </div>
          <div
            className="relative mt-2 h-[18px] overflow-hidden rounded-full bg-[#e5e5ea]"
            role="progressbar"
            aria-valuenow={quest.progress}
            aria-valuemin={0}
            aria-valuemax={quest.target}
            aria-label={quest.title}
          >
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ backgroundColor: quest.done ? "#34C759" : "#FFC800" }}
              initial={reduceMotion ? false : { width: "0%" }}
              animate={{ width: `${percent}%` }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut", delay: 0.15 + 0.08 * index }}
            />
            <span
              className={`absolute inset-0 flex items-center justify-center text-[12px] font-extrabold tabular-nums ${
                quest.done ? "text-white" : "text-[#6e6e73]"
              }`}
            >
              {quest.progress} / {quest.target}
            </span>
          </div>
        </div>
      </div>
      <Contributors quest={quest} />
      {quest.claimable ? (
        <button
          type="button"
          disabled={claiming}
          onClick={() => onClaim(quest.id)}
          className={chunkyButton(claiming ? "disabled" : "success", "h-11 w-full")}
        >
          Nhận +{quest.xp} XP
        </button>
      ) : quest.claimed ? (
        <p className="flex items-center gap-1 text-[13px] font-extrabold text-[#248a3d]">
          <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            check_circle
          </span>
          Đã nhận +{quest.xp} XP
        </p>
      ) : hint ? (
        <p className="text-[12px] font-bold text-[#5856D6]">{hint}</p>
      ) : null}
    </motion.li>
  );
}

function QuestGroup({
  title,
  countdown,
  quests,
  claiming,
  onClaim,
}: {
  title: string;
  countdown: string | null;
  quests: readonly ClassQuestView[];
  claiming: string | null;
  onClaim: (id: string) => void;
}) {
  if (quests.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between px-1">
        <h3 className="text-[14px] font-extrabold tracking-wide text-[#6e6e73] uppercase">{title}</h3>
        {countdown ? <span className="text-[12px] font-bold text-[#86868b]">{countdown}</span> : null}
      </div>
      <ul className="overflow-hidden rounded-[24px] border-2 border-[#e5e5ea] bg-white shadow-[0_4px_0_0_#e5e5ea]">
        {quests.map((quest, index) => (
          <ClassQuestCard
            key={quest.id}
            quest={quest}
            index={index}
            claiming={claiming === quest.id}
            onClaim={onClaim}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * Quests the whole class works on. Hidden for learners without a class, and
 * when class quests cannot be loaded.
 */
export function ClassQuestsSection({ onClaimed }: { onClaimed: (xp: number) => void }) {
  const [board, setBoard] = useState<ClassQuestBoard | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);

  const load = useCallback(() => {
    void fetch("/api/class-quests")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        setBoard(readClassQuestBoard(data));
        setNow(Date.now());
      })
      .catch(() => {
        // Keep whatever is on screen.
      });
  }, []);

  useEffect(() => {
    load();
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const expired =
    board != null && now != null && board.dayEndsAt !== "" && now >= Date.parse(board.dayEndsAt);
  useEffect(() => {
    if (expired) load();
  }, [expired, load]);

  const claim = useCallback(
    (questId: string) => {
      setClaiming(questId);
      void fetch("/api/class-quests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questId }),
      })
        .then((response) => response.json())
        .then((data: unknown) => {
          const next = readClassQuestBoard(data);
          if (next) setBoard(next);
          const xp = (data as { claimedXp?: unknown } | null)?.claimedXp;
          if (typeof xp === "number" && xp > 0) onClaimed(xp);
        })
        .catch(() => load())
        .finally(() => setClaiming(null));
    },
    [load, onClaimed],
  );

  if (!board) return null;
  const at = now != null ? new Date(now) : null;
  return (
    <section aria-label="Nhiệm vụ lớp" className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-2 px-1 pt-2">
        <h2 className="flex min-w-0 items-center gap-1.5 text-[18px] font-extrabold text-[#1d1d1f]">
          <span className="material-symbols-outlined text-[22px] text-[#5856D6]" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">
            groups
          </span>
          <span className="truncate">Nhiệm vụ lớp</span>
        </h2>
        {board.className ? (
          <span className="min-w-0 truncate text-[13px] font-bold text-[#6e6e73]">
            {board.className} · {board.learners} bạn
          </span>
        ) : null}
      </div>
      <QuestGroup
        title="Hôm nay"
        countdown={at && board.dayEndsAt ? formatWeekCountdown(board.dayEndsAt, at) : null}
        quests={board.daily}
        claiming={claiming}
        onClaim={claim}
      />
      <QuestGroup
        title="Tuần này"
        countdown={at && board.weekEndsAt ? formatWeekCountdown(board.weekEndsAt, at) : null}
        quests={board.weekly}
        claiming={claiming}
        onClaim={claim}
      />
      <p className="px-2 text-center text-[12px] font-semibold text-[#86868b]">
        Ai góp sức thì nhận XP khi lớp hoàn thành. Nhận trước khi hết ngày hoặc hết tuần.
      </p>
    </section>
  );
}
