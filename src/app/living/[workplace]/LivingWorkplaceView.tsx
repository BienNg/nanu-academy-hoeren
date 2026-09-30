"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { LivingWorkplace } from "@/lib/living-content";
import { useProgress } from "@/lib/useProgress";
import { ProfileButton } from "@/components/ProfileButton";
import { TodayXpChip } from "@/components/TodayXpChip";

export type LivingSceneSummary = {
  id: string;
  label: string;
  labelVi: string | null;
  progressKey: string;
  clipCount: number;
  replyCount: number;
  numberCount: number;
  imageCount: number;
};

type SceneState = {
  studyDone: boolean;
  practiceDone: boolean;
  /** 0–1 share of clips cleared in practice. */
  practiceShare: number;
};

function MaterialIcon({
  name,
  className,
  filled = false,
}: {
  name: string;
  className?: string;
  filled?: boolean;
}) {
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

function sceneHref(workplaceSlug: string, sceneId: string, part: "study" | "practice"): string {
  return `/living/${workplaceSlug}/${sceneId}/${part}`;
}

function ExerciseTags({ scene }: { scene: LivingSceneSummary }) {
  const tags = [
    { icon: "headphones", label: `${scene.clipCount} câu` },
    ...(scene.replyCount > 0 ? [{ icon: "forum", label: `${scene.replyCount} Was sagst du?` }] : []),
    ...(scene.numberCount > 0 ? [{ icon: "pin", label: `${scene.numberCount} Zahlen` }] : []),
    ...(scene.imageCount > 0 ? [{ icon: "image", label: `${scene.imageCount} Bild` }] : []),
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag.icon}
          className="inline-flex items-center gap-1 rounded-full bg-[#f5f5f7] px-2 py-0.5 text-[12px] font-semibold text-[#6e6e73]"
        >
          <MaterialIcon name={tag.icon} className="text-[14px]" />
          {tag.label}
        </span>
      ))}
    </div>
  );
}

function SceneCard({
  workplaceSlug,
  scene,
  index,
  state,
  practiceLocked,
  focused,
}: {
  workplaceSlug: string;
  scene: LivingSceneSummary;
  index: number;
  state: SceneState;
  practiceLocked: boolean;
  focused: boolean;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const percent = Math.round(state.practiceShare * 100);

  useEffect(() => {
    if (!focused) return;
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focused]);

  return (
    <li
      ref={ref}
      className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-[0_4px_0_0_#e5e7eb] transition-colors ${
        focused ? "border-[#0066cc]/40" : "border-black/[0.05]"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[15px] font-bold ${
            state.practiceDone
              ? "bg-[#34C759] text-white"
              : "bg-[#0066cc]/10 text-[#0066cc]"
          }`}
        >
          {state.practiceDone ? <MaterialIcon name="check" className="text-[22px]" filled /> : index + 1}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-[17px] font-bold leading-6 text-[#1d1d1f]">{scene.label}</h2>
          {scene.labelVi ? (
            <p className="text-[14px] font-medium leading-5 text-[#86868b]">{scene.labelVi}</p>
          ) : null}
          <ExerciseTags scene={scene} />
        </div>
      </div>

      {state.studyDone && !state.practiceDone && percent > 0 ? (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-[#e8e8ed]"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Luyện tập ${percent}%`}
        >
          <div className="h-full rounded-full bg-[#0066cc]" style={{ width: `${percent}%` }} />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Link
          href={sceneHref(workplaceSlug, scene.id, "study")}
          className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold transition-all active:scale-[0.98] ${
            state.studyDone
              ? "bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]"
              : "bg-[#0066cc] text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)]"
          }`}
        >
          <MaterialIcon name={state.studyDone ? "check_circle" : "menu_book"} className="text-[18px]" filled={state.studyDone} />
          Học
        </Link>
        {practiceLocked ? (
          <span
            className="flex h-11 cursor-not-allowed items-center justify-center gap-1.5 rounded-xl bg-[#f5f5f7] text-[15px] font-semibold text-[#86868b]"
            title="Học xong trước rồi luyện tập"
          >
            <MaterialIcon name="lock" className="text-[18px]" />
            Luyện tập
          </span>
        ) : (
          <Link
            href={sceneHref(workplaceSlug, scene.id, "practice")}
            className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold transition-all active:scale-[0.98] ${
              state.practiceDone
                ? "bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]"
                : "bg-[#0066cc] text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)]"
            }`}
          >
            <MaterialIcon name={state.practiceDone ? "replay" : "headphones"} className="text-[18px]" />
            {state.practiceDone ? "Luyện lại" : "Luyện tập"}
          </Link>
        )}
      </div>
    </li>
  );
}

export default function LivingWorkplaceView({
  workplace,
  scenes,
  focusScene,
  isAdmin,
}: {
  workplace: LivingWorkplace;
  scenes: LivingSceneSummary[];
  focusScene: string | null;
  isAdmin: boolean;
}) {
  const {
    progressReady,
    streakDays,
    learnStudyCompleted,
    learnChapterCompleted,
    completedLearnClipIdsFor,
  } = useProgress();

  const states = scenes.map((scene): SceneState => {
    const practiceDone = learnChapterCompleted(scene.progressKey);
    const cleared = completedLearnClipIdsFor(scene.progressKey).length;
    return {
      studyDone: learnStudyCompleted(scene.progressKey),
      practiceDone,
      practiceShare: practiceDone
        ? 1
        : scene.clipCount === 0
          ? 0
          : Math.min(1, cleared / scene.clipCount),
    };
  });
  const overallPercent =
    scenes.length === 0
      ? 0
      : Math.round(
          (states.reduce(
            (total, state) => total + (state.studyDone ? 0.5 : 0) + state.practiceShare * 0.5,
            0,
          ) /
            scenes.length) *
            100,
        );

  const nextIndex = states.findIndex((state) => !state.practiceDone);
  const nextScene = nextIndex >= 0 ? scenes[nextIndex] : undefined;
  const nextState = nextIndex >= 0 ? states[nextIndex] : undefined;
  const nextHref =
    nextScene && nextState
      ? sceneHref(workplace.slug, nextScene.id, nextState.studyDone ? "practice" : "study")
      : null;

  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-full max-w-none flex-1 flex-col items-center overflow-x-hidden bg-[#fbfbfd] selection:bg-[#0066cc] selection:text-white"
      style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
    >
      <header className="fixed top-0 left-0 z-50 w-full border-b border-black/[0.05] bg-[#fbfbfd]/80 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[#0066cc] transition-opacity hover:opacity-80 active:opacity-60"
          >
            <MaterialIcon name="arrow_back_ios_new" className="text-[20px]" />
            <span className="text-[17px] font-medium tracking-tight">Trở về</span>
          </Link>
          <div className="flex items-center gap-2">
            <div
              className="flex items-center gap-1 rounded-full border border-black/[0.05] bg-white px-2.5 py-1 shadow-sm"
              aria-label={`Chuỗi ${streakDays} ngày`}
            >
              <MaterialIcon name="local_fire_department" className="text-[16px] text-[#ff9500]" filled />
              <span className="text-[13px] font-semibold text-[#1d1d1f]">{streakDays} ngày</span>
            </div>
            <TodayXpChip />
            <ProfileButton />
          </div>
        </div>
      </header>

      <div className="pointer-events-none absolute left-1/2 top-0 h-[800px] w-screen -translate-x-1/2 overflow-hidden opacity-50">
        <div className="absolute -top-[20%] -left-[10%] h-[70%] w-[70vw] rounded-full bg-gradient-to-br from-rose-100/40 to-amber-100/40 blur-3xl" />
        <div className="absolute top-[10%] -right-[10%] h-[60%] w-[60vw] rounded-full bg-gradient-to-bl from-teal-100/30 to-blue-50/30 blur-3xl" />
      </div>

      <section className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-[calc(3.5rem+env(safe-area-inset-top,0px)+1rem)] pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] sm:px-6">
        <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#e11d48] to-[#f97316] p-4 text-white shadow-[0_6px_0_0_#be123c]">
          <div className="relative z-10 flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-rose-100">
              <MaterialIcon name={workplace.icon ?? "storefront"} className="text-[16px]" />
              Leben in Deutschland
            </span>
            <h1 className="text-[20px] font-extrabold leading-7 text-white">{workplace.label}</h1>
            <p className="mt-1 text-[14px] font-medium leading-5 text-rose-50">
              {workplace.labelVi ? `${workplace.labelVi} · ` : ""}
              {scenes.length} tình huống thực tế tại nơi làm việc. Học từng tình huống, rồi luyện nghe và phản xạ.
            </p>
          </div>
          <div className="relative z-10 mt-4 flex flex-col gap-1.5 border-t border-white/20 pt-3">
            <div className="flex items-center justify-between text-[12px] font-bold leading-4 text-white">
              <span className="flex items-center gap-1">
                <MaterialIcon name="bolt" className="text-[16px] text-amber-300" filled />
                Tổng tiến độ
              </span>
              <span className="text-rose-50">{progressReady ? `${overallPercent}% hoàn thành` : "…"}</span>
            </div>
            <div
              className="h-3 w-full overflow-hidden rounded-full bg-black/20 p-0.5 shadow-inner"
              role="progressbar"
              aria-valuenow={overallPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Tổng tiến độ ${overallPercent}%`}
            >
              <div
                className="h-full rounded-full bg-amber-400 shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all duration-700 ease-out"
                style={{ width: `${progressReady ? overallPercent : 0}%` }}
              />
            </div>
          </div>
        </div>

        {nextHref && nextScene && progressReady ? (
          <Link
            href={nextHref}
            className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#0066cc] px-5 text-[16px] font-semibold text-white shadow-[0_4px_14px_rgba(0,102,204,0.3)] transition-all hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <MaterialIcon name="play_arrow" className="text-[22px]" filled />
            <span className="truncate">Tiếp tục: {nextScene.label}</span>
          </Link>
        ) : null}

        {scenes.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-[15px] text-[#86868b]">
            Chưa có tình huống nào.
          </p>
        ) : (
          <ol className="flex flex-col gap-3">
            {scenes.map((scene, index) => {
              const state = states[index] ?? { studyDone: false, practiceDone: false, practiceShare: 0 };
              return (
                <SceneCard
                  key={scene.id}
                  workplaceSlug={workplace.slug}
                  scene={scene}
                  index={index}
                  state={state}
                  practiceLocked={!isAdmin && progressReady && !state.studyDone}
                  focused={focusScene === scene.id}
                />
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
