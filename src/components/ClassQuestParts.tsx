"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { chunkyButton } from "@/components/chunkyButton";
import { PersonAvatar } from "@/components/LeaderboardParts";
import { classQuestById, readClassQuestBoard, type ClassQuestBoard, type ClassQuestView } from "@/lib/class-quests";
import { formatWeekCountdown } from "@/lib/xp";

const SPRING = { type: "spring" as const, stiffness: 420, damping: 18 };
/** Avatars shown before the rest collapse into "+N". */
const AVATAR_LIMIT = 6;
/** One color per contributor, in the order they are drawn on the bar. */
const SHARE_COLORS = ["#FFC800", "#FF9600", "#CE82FF", "#1CB0F6", "#58CC02", "#FF4B4B", "#5856D6", "#FF86D0"];

function shareOrder(quest: ClassQuestView) {
  return [...quest.contributors].sort(
    (left, right) => right.amount - left.amount || left.name.localeCompare(right.name, "vi"),
  );
}

/** The tab where this quest's progress is earned. */
function questAction(questId: string): { href: string; label: string } {
  const metric = classQuestById(questId)?.metric;
  if (metric === "duels") return { href: "/duel", label: "Đấu ngay" };
  if (metric === "studied") return { href: "/", label: "Học từ vựng" };
  return { href: "/", label: "Luyện tập ngay" };
}

function Contributors({ quest }: { quest: ClassQuestView }) {
  if (quest.contributors.length === 0) {
    return <p className="text-[12px] font-bold text-[#86868b]">Chưa ai góp sức. Hãy là người đầu tiên!</p>;
  }
  if (quest.showAmounts) {
    const shares = shareOrder(quest);
    return (
      <p className="flex flex-wrap gap-x-2 gap-y-1 text-[12px] font-bold leading-5 text-[#6e6e73]">
        {shares.map((person, index) => (
          <span key={`${person.name}-${index}`} className="inline-flex items-center gap-1">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: SHARE_COLORS[index % SHARE_COLORS.length] }}
              aria-hidden="true"
            />
            <span className="text-[#1d1d1f]">{person.name}</span> {person.amount}
          </span>
        ))}
      </p>
    );
  }
  const shown = quest.contributors.slice(0, AVATAR_LIMIT);
  const more = quest.contributors.length - shown.length;
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
  observing,
  onClaim,
}: {
  quest: ClassQuestView;
  index: number;
  claiming: boolean;
  observing: boolean;
  onClaim: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion() ?? false;
  const action = questAction(quest.id);
  const shares = quest.showAmounts ? shareOrder(quest) : [];
  const contributed = shares.reduce((sum, person) => sum + person.amount, 0);
  const basis = Math.max(quest.target, contributed);
  const percent = Math.min(100, Math.round((quest.progress / quest.target) * 100));
  const hint = observing
    ? null
    : quest.claimed
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
            {shares.length > 0
              ? shares.map((person, shareIndex) => {
                  const width = (person.amount / basis) * 100;
                  const left = shares
                    .slice(0, shareIndex)
                    .reduce((sum, earlier) => sum + (earlier.amount / basis) * 100, 0);
                  return (
                    <motion.div
                      key={`${person.name}-${shareIndex}`}
                      className="absolute inset-y-0"
                      style={{ backgroundColor: SHARE_COLORS[shareIndex % SHARE_COLORS.length] }}
                      initial={reduceMotion ? false : { left: `${left}%`, width: "0%" }}
                      animate={{ left: `${left}%`, width: `${width}%` }}
                      transition={
                        reduceMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut", delay: 0.15 + 0.08 * index }
                      }
                    />
                  );
                })
              : (
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: quest.done ? "#34C759" : "#FFC800" }}
                  initial={reduceMotion ? false : { width: "0%" }}
                  animate={{ width: `${percent}%` }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.8, ease: "easeOut", delay: 0.15 + 0.08 * index }}
                />
              )}
            <span
              className={`absolute inset-0 flex items-center justify-center text-[12px] font-extrabold tabular-nums ${
                quest.showAmounts
                  ? "text-[#1d1d1f] [text-shadow:0_0_3px_#fff]"
                  : quest.done
                    ? "text-white"
                    : "text-[#6e6e73]"
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
      ) : observing ? (
        hint ? <p className="text-[12px] font-bold text-[#5856D6]">{hint}</p> : null
      ) : (
        <>
          {hint ? <p className="text-[12px] font-bold text-[#5856D6]">{hint}</p> : null}
          <Link href={action.href} className={chunkyButton("primary", "h-11 w-full")}>
            {action.label}
          </Link>
        </>
      )}
    </motion.li>
  );
}

function QuestGroup({
  title,
  countdown,
  quests,
  claiming,
  observing,
  onClaim,
}: {
  title: string;
  countdown: string | null;
  quests: readonly ClassQuestView[];
  claiming: string | null;
  observing: boolean;
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
            observing={observing}
            onClaim={onClaim}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * Quests the whole class works on. Hidden for learners without a class and for
 * staff. An admin can watch any class, without counting toward its quests.
 */
export function ClassQuestsSection({ onClaimed }: { onClaimed: (xp: number) => void }) {
  const [board, setBoard] = useState<ClassQuestBoard | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const classKeyRef = useRef("");

  const load = useCallback(() => {
    const key = classKeyRef.current;
    const url = key ? `/api/class-quests?class=${encodeURIComponent(key)}` : "/api/class-quests";
    void fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        const next = readClassQuestBoard(data);
        if (next?.classKey) classKeyRef.current = next.classKey;
        setBoard(next);
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
        {board.classOptions.length > 1 ? (
          <label className="flex min-w-0 items-center gap-2 text-[13px] font-bold text-[#6e6e73]">
            <span className="sr-only">Lớp</span>
            <select
              value={board.classKey}
              onChange={(event) => {
                classKeyRef.current = event.target.value;
                load();
              }}
              className="max-w-[11rem] truncate rounded-xl bg-[#e5e5ea] px-2 py-1 text-[13px] font-extrabold text-[#1d1d1f]"
            >
              {board.classOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <span className="shrink-0">{board.learners} bạn</span>
          </label>
        ) : board.className ? (
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
        observing={board.observing}
        onClaim={claim}
      />
      <QuestGroup
        title="Tuần này"
        countdown={at && board.weekEndsAt ? formatWeekCountdown(board.weekEndsAt, at) : null}
        quests={board.weekly}
        claiming={claiming}
        observing={board.observing}
        onClaim={claim}
      />
      <p className="px-2 text-center text-[12px] font-semibold text-[#86868b]">
        Ai góp sức thì nhận XP khi lớp hoàn thành. Nhận trước khi hết ngày hoặc hết tuần.
      </p>
    </section>
  );
}
