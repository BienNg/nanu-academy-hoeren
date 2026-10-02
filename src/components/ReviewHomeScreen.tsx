"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BottomNav } from "@/components/BottomNav";
import { TopBarStatus } from "@/components/TodayXpChip";
import {
  BOX_INTERVAL_DAYS,
  daysBetween,
  intervalLabel,
  LEITNER_SCHEMA_HINT,
  REVIEW_ROUND_CLIPS,
  REVIEW_UNLOCK_CLIPS,
  TOP_BOX,
} from "@/lib/leitner";
import type { LearnedClip, ReviewOverview } from "@/lib/leitner-store";

type ReviewHomeScreenProps = {
  overview: ReviewOverview;
  isAdmin: boolean;
};

function Icon({ name, className, filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function shortDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(date)}/${Number(month)}`;
}

function nextDueText(overview: ReviewOverview): string {
  if (overview.dueTomorrow > 0) return `Ngày mai có ${overview.dueTomorrow} câu.`;
  if (!overview.nextDueOn) return "";
  const days = daysBetween(overview.today, overview.nextDueOn);
  return `Lần ôn tới: ${shortDay(overview.nextDueOn)} (sau ${days} ngày).`;
}

function learnedGroups(clips: readonly LearnedClip[]): { label: string; clips: LearnedClip[] }[] {
  const groups: { label: string; clips: LearnedClip[] }[] = [];
  for (const clip of clips) {
    const last = groups[groups.length - 1];
    if (last?.label === clip.lessonLabel) last.clips.push(clip);
    else groups.push({ label: clip.lessonLabel, clips: [clip] });
  }
  return groups;
}

function LearnedClipsModal({ clips, onClose }: { clips: LearnedClip[]; onClose: () => void }) {
  const groups = learnedGroups(clips);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#131b2e]/45 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="learned-clips-title"
        className="flex max-h-[min(88dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] bg-white text-[#131b2e] shadow-[0_8px_0_0_#dae2fd] sm:rounded-[28px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <h2 id="learned-clips-title" className="text-[18px] font-extrabold">
              Câu đã học
            </h2>
            <p className="mt-0.5 text-[13px] font-semibold text-[#6e7881]">
              {clips.length} câu trong hộp ôn tập
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef4ff] text-[#131b2e]"
          >
            <Icon name="close" className="text-[22px]" />
          </button>
        </div>
        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {clips.length === 0 ? (
            <p className="py-8 text-center text-[14px] font-semibold text-[#6e7881]">Chưa có câu nào.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <section key={group.label}>
                  <h3 className="text-[12px] font-extrabold uppercase tracking-wide text-[#0284c7]">
                    {group.label}
                  </h3>
                  <ul className="mt-2 flex flex-col gap-2">
                    {group.clips.map((clip) => (
                      <li key={clip.id} className="rounded-2xl bg-[#f8fafc] px-3 py-2.5">
                        <p className="text-[15px] font-extrabold leading-snug">{clip.script}</p>
                        <p className="mt-0.5 text-[13px] font-medium leading-snug text-[#3e4850]">
                          {clip.translationVi}
                        </p>
                        <p className="mt-1 text-[11px] font-bold text-[#6e7881]">
                          Hộp {clip.box} · quay lại sau {intervalLabel(BOX_INTERVAL_DAYS[clip.box] ?? 1)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TodayCard({ overview }: { overview: ReviewOverview }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const locked = overview.total < REVIEW_UNLOCK_CLIPS;
  const needed = clipsStillNeeded(overview.total);
  const roundSize = Math.min(overview.due, REVIEW_ROUND_CLIPS);
  const learned = overview.learned;
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-5 text-white shadow-[0_6px_0_0_#0369a1]">
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100">Hôm nay</p>
          {locked ? (
            <p className="mt-1 text-[22px] font-extrabold leading-tight">Ôn tập chưa mở</p>
          ) : overview.due > 0 ? (
            <>
              <p className="mt-1 text-[40px] font-extrabold leading-none tabular-nums">{overview.due}</p>
              <p className="mt-1 text-[14px] font-bold">câu cần ôn</p>
            </>
          ) : (
            <p className="mt-1 text-[22px] font-extrabold leading-tight">Đã ôn xong</p>
          )}
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-[0_3px_0_0_rgba(3,105,161,0.45)]">
          <Icon name={locked ? "lock" : overview.due > 0 ? "event_repeat" : "task_alt"} className="text-[32px] text-[#ffd60a]" filled />
        </div>
      </div>
      <p className="relative z-10 mt-3 text-[13px] font-semibold text-sky-50">
        {locked
          ? `Còn thiếu ${needed} câu có nghĩa. Ôn tập mở khi đủ ${REVIEW_UNLOCK_CLIPS} câu.`
          : overview.due > 0
            ? "Câu hay sai nhất được hỏi trước. Mỗi câu có hai thẻ: chọn nghĩa, rồi gõ lại tiếng Đức."
            : nextDueText(overview)}
      </p>
      {locked ? null : overview.due > 0 ? (
        <Link
          href="/review/session"
          className="relative z-10 mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[16px] font-extrabold text-[#0369a1] shadow-[0_4px_0_0_#bae6fd] transition-transform active:translate-y-0.5"
        >
          Bắt đầu ôn · {roundSize} câu
          <Icon name="arrow_forward" className="text-[20px]" />
        </Link>
      ) : null}
      {learned.length > 0 ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`relative z-10 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-extrabold transition-transform active:translate-y-0.5 ${
            overview.due > 0
              ? "mt-2 bg-white/15 text-white shadow-[0_4px_0_0_rgba(3,105,161,0.45)]"
              : "mt-4 bg-white text-[#0369a1] shadow-[0_4px_0_0_#bae6fd]"
          }`}
        >
          Xem câu đã học
          <Icon name="menu_book" className="text-[20px]" />
        </button>
      ) : null}
      <Icon
        name="event_repeat"
        className="pointer-events-none absolute -right-3 -bottom-6 text-[120px] text-white/15"
      />
      {open ? createPortal(<LearnedClipsModal clips={learned} onClose={close} />, document.body) : null}
    </section>
  );
}

function boxTone(box: number): { face: string; edge: string } {
  if (box === 0) return { face: "bg-[#fb923c]", edge: "shadow-[0_2px_0_0_#c2410c]" };
  if (box === TOP_BOX) return { face: "bg-[#0f766e]", edge: "shadow-[0_2px_0_0_#115e59]" };
  return { face: "bg-[#38bdf8]", edge: "shadow-[0_2px_0_0_#0284c7]" };
}

function BoxMark({ box }: { box: number }) {
  const tone = boxTone(box);
  return (
    <span
      className={`relative flex h-8 w-8 items-end justify-center rounded-[8px] pb-[3px] text-[13px] font-extrabold text-white sm:h-9 sm:w-9 sm:rounded-[9px] sm:text-[14px] ${tone.face} ${tone.edge}`}
    >
      <span className="absolute inset-x-1 top-1 h-[3px] rounded-full bg-white/50" aria-hidden="true" />
      {box}
    </span>
  );
}

const BOX_LEVELS = ["Hay quên", "Mới gặp", "Đang quen", "Nhớ được", "Khá chắc", "Gần thuộc", "Nằm lòng"] as const;

const BOX_ROW =
  "grid grid-cols-[2.25rem_minmax(0,1fr)_1.75rem_5.75rem] gap-x-2 sm:grid-cols-[2.75rem_minmax(0,1fr)_2.25rem_6.5rem] sm:gap-x-3";

function clipsStillNeeded(have: number): number {
  return Math.max(0, REVIEW_UNLOCK_CLIPS - have);
}

function BoxChart({ overview }: { overview: ReviewOverview }) {
  const locked = overview.total < REVIEW_UNLOCK_CLIPS;
  const needed = clipsStillNeeded(overview.total);
  const most = Math.max(1, ...overview.boxCounts);
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-white p-5 shadow-[0_4px_0_0_#dae2fd]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-extrabold text-[#131b2e]">Câu đang ở hộp nào</h2>
        <p className="text-[13px] font-bold tabular-nums text-[#6e7881]">{overview.total} câu</p>
      </div>
      <p className="mt-1 text-[13px] font-medium leading-relaxed text-[#6e7881]">
        Hộp 0 là câu hay sai. Đúng khi đến hạn thì câu lên hộp kế và chờ lâu hơn. Sai thì câu về hộp 0.
      </p>
      <div className={`mt-4 items-end text-[11px] font-bold text-[#94a3b8] ${BOX_ROW}`}>
        <span>Hộp</span>
        <span aria-hidden="true" />
        <span className="text-right">Câu</span>
        <span className="whitespace-nowrap text-right">Mức nhớ</span>
      </div>
      <ol className="mt-2 flex flex-col gap-2" aria-label="Số câu trong mỗi hộp">
        {BOX_LEVELS.map((level, box) => {
          const count = overview.boxCounts[box] ?? 0;
          const width = count === 0 ? 0 : Math.max(8, Math.round((count / most) * 100));
          return (
            <li
              key={box}
              className={`items-center ${BOX_ROW}`}
              aria-label={`Hộp ${box}: ${count} câu, mức nhớ ${level}`}
            >
              <BoxMark box={box} />
              <span className="relative h-2.5 min-w-0 overflow-hidden rounded-full bg-[#eef4ff]">
                {width > 0 ? (
                  <span
                    className={`absolute inset-y-0 left-0 rounded-full ${boxTone(box).face}`}
                    style={{ width: `${width}%` }}
                  />
                ) : null}
              </span>
              <span
                className={`text-right text-[14px] font-extrabold tabular-nums ${count === 0 ? "text-[#c5ced6]" : "text-[#131b2e]"}`}
              >
                {count}
              </span>
              <span className="whitespace-nowrap text-right text-[12px] font-bold leading-tight text-[#3e4850] sm:text-[13px]">
                {level}
              </span>
            </li>
          );
        })}
      </ol>
      {locked ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/70 px-6 text-center backdrop-blur-[1px]">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0284c7] shadow-[0_4px_0_0_#dae2fd]">
            <Icon name="lock" className="text-[30px]" filled />
          </span>
          <span className="text-[16px] font-extrabold leading-snug text-[#131b2e]">
            Còn thiếu {needed} câu có nghĩa
          </span>
          <span className="text-[13px] font-semibold leading-snug text-[#3e4850]">
            Hộp mở khi đủ {REVIEW_UNLOCK_CLIPS} câu
          </span>
          <Link
            href="/"
            className="mt-2 flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-[#0284c7] text-[16px] font-extrabold text-white shadow-[0_4px_0_0_#0369a1] transition-transform active:translate-y-0.5"
          >
            Luyện thêm ở Học
            <Icon name="arrow_forward" className="text-[20px]" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

const RULES = [
  {
    icon: "flag",
    title: "Lần đầu luyện",
    text: `Câu đúng ngay lần đầu vào hộp 1 và quay lại sau ${intervalLabel(BOX_INTERVAL_DAYS[1])}. Câu sai vào hộp 0 và quay lại ngày mai.`,
  },
  {
    icon: "trending_up",
    title: "Đúng khi đến hạn",
    text: "Câu lên một hộp, nên thời gian chờ dài dần. Câu đã thuộc sẽ ít gặp lại.",
  },
  {
    icon: "restart_alt",
    title: "Sai bất kỳ lúc nào",
    text: "Câu về hộp 0 và quay lại ngày mai, dù đang ở hộp nào. Câu sai nhiều lần được hỏi trước.",
  },
  {
    icon: "hourglass_empty",
    title: "Đúng trước hạn",
    text: "Luyện lại bài và trả lời đúng trước ngày hẹn thì hộp không đổi. Chỉ lần ôn đúng hạn mới được lên hộp.",
  },
] as const;

function HowItWorks() {
  return (
    <section className="rounded-[28px] bg-white shadow-[0_4px_0_0_#dae2fd]">
      <h2 className="flex items-center gap-2 px-5 py-4 text-[16px] font-extrabold text-[#131b2e]">
        <Icon name="lightbulb" className="text-[22px] text-[#0284c7]" />
        Cách hoạt động
      </h2>
      <div className="flex flex-col gap-3 px-5 pb-5">
        <ul className="flex flex-col gap-3">
          {RULES.map((rule) => (
            <li key={rule.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e0f2fe] text-[#0284c7]">
                <Icon name={rule.icon} className="text-[20px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-extrabold text-[#131b2e]">{rule.title}</span>
                <span className="block text-[13px] font-medium leading-relaxed text-[#6e7881]">{rule.text}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ReviewHomeScreen({ overview, isAdmin }: ReviewHomeScreenProps) {
  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col bg-[#faf8ff] text-[#131b2e]"
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 pb-2.5 pt-3 sm:px-6">
          <h1 className="min-w-0 font-headline-md text-headline-md font-extrabold tracking-tight text-[#131b2e]">
            Ôn tập
          </h1>
          <TopBarStatus />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
        {overview.status !== "ready" ? (
          <section className="rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#dae2fd]">
            <p className="text-[16px] font-extrabold text-[#131b2e]">
              {overview.status === "missing" ? "Ôn tập chưa được bật" : "Không tải được hộp ôn tập"}
            </p>
            <p className="mt-2 text-[14px] font-medium leading-relaxed text-[#6e7881]">
              {overview.status === "missing"
                ? isAdmin
                  ? LEITNER_SCHEMA_HINT
                  : "Mục này sẽ hiện sau khi giáo viên bật tính năng ôn tập."
                : "Vui lòng thử lại sau."}
            </p>
          </section>
        ) : (
          <>
            <TodayCard overview={overview} />
            <BoxChart overview={overview} />
            <HowItWorks />
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
