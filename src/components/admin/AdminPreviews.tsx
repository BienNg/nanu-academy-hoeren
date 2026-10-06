"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { CARD } from "@/components/admin/AdminUi";
import { BadgeUnlockSheet } from "@/components/BadgeParts";
import { PartCompleteScreen, RankClimbStepView } from "@/components/session/PartCompleteScreen";
import { freshBadge, type FreshBadge } from "@/lib/badges";
import { planRankClimb } from "@/lib/rank-climb";
import type { QuestUpdate } from "@/lib/quests";
import { dropQueuedStreakCelebration, stageStreakCelebration } from "@/lib/useProgress";
import type { LeaderboardRow } from "@/lib/xp";

type SequenceFlags = {
  streak: boolean;
  quests: boolean;
  board: boolean;
  badge: boolean;
};

/** Every mix of the four celebrations after a finished part, except streak-only and quests-only, which already have their own cards. */
const SEQUENCES: readonly {
  id: string;
  flags: SequenceFlags;
  title: string;
  detail: string;
  steps: number;
}[] = Array.from({ length: 15 }, (_, index) => {
    const mask = index + 1;
    const flags: SequenceFlags = {
      streak: (mask & 1) !== 0,
      quests: (mask & 2) !== 0,
      board: (mask & 4) !== 0,
      badge: (mask & 8) !== 0,
    };
    const steps = [
      flags.streak ? "streak" : null,
      flags.quests ? "quests" : null,
      flags.board ? "leaderboard" : null,
      flags.badge ? "badge" : null,
    ].filter((step): step is string => step != null);
    return {
      id: `seq-${mask}`,
      flags,
      title: `Part complete, then ${steps.join(", ")}`,
      detail: "In the order a learner would see them. Nothing is stored.",
      steps: steps.length,
    };
  })
    .filter((entry) => entry.steps > 1 || entry.flags.board || entry.flags.badge)
    .sort((a, b) => a.steps - b.steps || a.id.localeCompare(b.id));

type SceneId =
  | "badge"
  | "badges"
  | "tiers"
  | "fail"
  | "part"
  | "lesson"
  | "repeat"
  | "rejected"
  | "jump"
  | "jump-fail"
  | "streak"
  | "quests"
  | "bonus"
  | "climb";

const SCENES: readonly { id: SceneId; group: string; title: string; detail: string }[] = [
  {
    id: "badge",
    group: "Badges",
    title: "One new badge",
    detail: "Full-screen celebration. Does not mark it seen.",
  },
  {
    id: "badges",
    group: "Badges",
    title: "Two badges in a row",
    detail: "Next, then the done button.",
  },
  {
    id: "tiers",
    group: "Badges",
    title: "One pose per tier",
    detail: "Đồng, Bạc, Vàng, then Kim cương. Each uses the badge that was earned.",
  },
  {
    id: "fail",
    group: "End of a part",
    title: "Out of hearts",
    detail: "A failed listening part.",
  },
  {
    id: "part",
    group: "End of a part",
    title: "Part complete",
    detail: "With XP. Admins are not on a class board, so the ranking step closes itself.",
  },
  {
    id: "lesson",
    group: "End of a part",
    title: "Lesson complete",
    detail: "100% and the lesson's XP.",
  },
  {
    id: "repeat",
    group: "End of a part",
    title: "Already counted today",
    detail: "+0 XP because this part already counted.",
  },
  {
    id: "rejected",
    group: "End of a part",
    title: "No XP this time",
    detail: "+0 XP. Replay to earn it.",
  },
  {
    id: "jump",
    group: "End of a part",
    title: "Jump test passed",
    detail: "The test that skips a Lektion.",
  },
  {
    id: "jump-fail",
    group: "End of a part",
    title: "Jump test failed",
    detail: "The same test, not passed.",
  },
  {
    id: "streak",
    group: "After the part card",
    title: "Then the streak flame",
    detail: "The count goes from 6 to 7. No practice day is stored.",
  },
  {
    id: "quests",
    group: "After the part card",
    title: "Then daily quests",
    detail: "One quest just finished.",
  },
  {
    id: "bonus",
    group: "After the part card",
    title: "Then the bonus chest",
    detail: "All three quests for the day.",
  },
  {
    id: "climb",
    group: "After the part card",
    title: "Class board climb",
    detail: "Sample numbers. Does not read the real board.",
  },
];

function badgesFor(id: SceneId): FreshBadge[] {
  const ids =
    id === "badges"
      ? ["streak-2", "xp-1"]
      : id === "tiers"
        ? ["listening-1", "streak-2", "xp-3", "duel-4"]
        : ["listening-1"];
  return ids.flatMap((badgeId) => {
    const badge = freshBadge(badgeId);
    return badge ? [badge] : [];
  });
}

const MOVED_QUEST: QuestUpdate = {
  xp: 10,
  completed: ["Hoàn thành 1 phần luyện tập"],
  bonus: false,
  quests: [
    {
      id: "listen-1",
      kind: "listening",
      title: "Hoàn thành 1 phần luyện tập",
      xp: 10,
      target: 1,
      progress: 1,
      done: true,
      before: 0,
    },
    {
      id: "study-1",
      kind: "study",
      title: "Hoàn thành 1 phần học từ vựng",
      xp: 10,
      target: 1,
      progress: 0,
      done: false,
      before: 0,
    },
    {
      id: "habit-60",
      kind: "habit",
      title: "Kiếm 60 XP hôm nay",
      xp: 15,
      target: 60,
      progress: 32,
      done: false,
      before: 20,
    },
  ],
};

const BONUS_QUEST: QuestUpdate = {
  xp: 40,
  completed: [
    "Hoàn thành 1 phần luyện tập",
    "Hoàn thành 1 phần học từ vựng",
    "Kiếm 60 XP hôm nay",
  ],
  bonus: true,
  quests: [
    {
      id: "listen-1",
      kind: "listening",
      title: "Hoàn thành 1 phần luyện tập",
      xp: 10,
      target: 1,
      progress: 1,
      done: true,
      before: 0,
    },
    {
      id: "study-1",
      kind: "study",
      title: "Hoàn thành 1 phần học từ vựng",
      xp: 10,
      target: 1,
      progress: 1,
      done: true,
      before: 0,
    },
    {
      id: "habit-60",
      kind: "habit",
      title: "Kiếm 60 XP hôm nay",
      xp: 15,
      target: 60,
      progress: 60,
      done: true,
      before: 48,
    },
  ],
};

function sampleRow(name: string, xp: number, rank: number, isYou = false): LeaderboardRow {
  return {
    rank,
    name,
    xp,
    isYou,
    gapBefore: false,
    won: 0,
    tied: 0,
    lost: 0,
    image: null,
  };
}

const SAMPLE_CLIMB = planRankClimb(
  [
    sampleRow("Lan", 500, 1),
    sampleRow("Bạn", 460, 2, true),
    sampleRow("Minh", 450, 3),
    sampleRow("Hoa", 420, 4),
    sampleRow("An", 300, 5),
    sampleRow("Bình", 250, 6),
    sampleRow("Chi", 180, 7),
    sampleRow("Dũng", 90, 8),
  ],
  80,
);

export function AdminPreviews() {
  const [scene, setScene] = useState<SceneId | null>(null);
  const [sequence, setSequence] = useState<SequenceFlags | null>(null);
  const close = useCallback(() => {
    dropQueuedStreakCelebration();
    setScene(null);
    setSequence(null);
  }, []);

  useEffect(() => {
    if (scene !== "streak" && !sequence?.streak) return;
    stageStreakCelebration({ from: 6, to: 7 });
    return () => dropQueuedStreakCelebration();
  }, [scene, sequence]);

  useEffect(() => {
    if (!scene && !sequence) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, sequence, close]);

  const groups = [...new Set(SCENES.map((entry) => entry.group))];

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="System"
        title="Previews"
        subtitle="Opens the screen a learner sees, with sample numbers. Stores no XP, badge, or progress."
      />
      {groups.map((group) => (
        <section key={group} className="flex flex-col gap-space-12">
          <h2 className="text-admin-label-sm uppercase text-admin-ink-subtle">{group}</h2>
          <ul className="grid gap-space-12 sm:grid-cols-2">
            {SCENES.filter((entry) => entry.group === group).map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSequence(null);
                    setScene(entry.id);
                  }}
                  className={`${CARD} flex h-full w-full flex-col items-start gap-1 px-space-16 py-space-12 text-left transition-colors hover:border-admin-border`}
                >
                  <span className="text-admin-body-md font-semibold text-admin-ink">{entry.title}</span>
                  <span className="text-admin-body-sm text-admin-ink-subtle">{entry.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="flex flex-col gap-space-12">
        <h2 className="text-admin-label-sm uppercase text-admin-ink-subtle">Sequences</h2>
        <ul className="grid gap-space-12 sm:grid-cols-2">
          {SEQUENCES.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => {
                  setScene(null);
                  setSequence(entry.flags);
                }}
                className={`${CARD} flex h-full w-full flex-col items-start gap-1 px-space-16 py-space-12 text-left transition-colors hover:border-admin-border`}
              >
                <span className="text-admin-body-md font-semibold text-admin-ink">{entry.title}</span>
                <span className="text-admin-body-sm text-admin-ink-subtle">{entry.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {scene ? <PreviewStage scene={scene} onClose={close} /> : null}
      {sequence ? <SequencePreview flags={sequence} onClose={close} /> : null}
    </main>
  );
}

function PreviewStage({ scene, onClose }: { scene: SceneId; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        onClick={onClose}
        className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-[120] rounded-full border border-[#e5e5ea] bg-white px-3 py-1.5 text-[13px] font-extrabold text-[#1d1d1f] shadow-[0_2px_0_0_#e5e5ea]"
      >
        Close
      </button>
      {scene === "badge" || scene === "badges" || scene === "tiers" ? (
        <BadgeUnlockSheet badges={badgesFor(scene)} onDone={onClose} />
      ) : null}
      {scene === "climb" && SAMPLE_CLIMB ? (
        <RankClimbStepView
          climb={SAMPLE_CLIMB}
          className="A1 Sáng"
          countdown="Còn 3 ngày"
          continueLabel="Về bài học"
          onContinue={onClose}
        />
      ) : null}
      {scene !== "badge" && scene !== "badges" && scene !== "tiers" && scene !== "climb" ? (
        <PartCompleteScreen key={scene} {...partProps(scene, onClose)} />
      ) : null}
    </div>
  );
}

function SequencePreview({ flags, onClose }: { flags: SequenceFlags; onClose: () => void }) {
  const [step, setStep] = useState<"part" | "board" | "badge">("part");
  const afterPart = () => {
    if (flags.board) setStep("board");
    else if (flags.badge) setStep("badge");
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-[80]">
      <button
        type="button"
        onClick={onClose}
        className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-[120] rounded-full border border-[#e5e5ea] bg-white px-3 py-1.5 text-[13px] font-extrabold text-[#1d1d1f] shadow-[0_2px_0_0_#e5e5ea]"
      >
        Close
      </button>
      {step === "part" ? (
        <PartCompleteScreen
          {...partProps("part", afterPart)}
          celebrateStreak={flags.streak}
          questUpdate={flags.quests ? MOVED_QUEST : null}
          streakDays={flags.streak ? 7 : 4}
          skipBoard
        />
      ) : null}
      {step === "board" && SAMPLE_CLIMB ? (
        <RankClimbStepView
          climb={SAMPLE_CLIMB}
          className="A1 Sáng"
          countdown="Còn 3 ngày"
          continueLabel={flags.badge ? "Tiếp tục" : "Về bài học"}
          onContinue={() => {
            if (flags.badge) setStep("badge");
            else onClose();
          }}
        />
      ) : null}
      {step === "badge" ? <BadgeUnlockSheet badges={badgesFor("badge")} onDone={onClose} /> : null}
    </div>
  );
}

function partProps(scene: SceneId, onClose: () => void) {
  const failed = scene === "fail" || scene === "jump-fail";
  const finishRun = scene === "lesson" || scene === "jump";
  const questUpdate = scene === "quests" ? MOVED_QUEST : scene === "bonus" ? BONUS_QUEST : null;
  const earned = !failed && scene !== "repeat" && scene !== "rejected";
  return {
    partNumber: scene === "lesson" ? 3 : 2,
    partCount: 3,
    levelLabel: "A1.1",
    chapterLabel: "Lektion 5",
    questionCount: 8,
    accuracy: scene === "lesson" || scene === "jump" ? 100 : failed ? 40 : 75,
    elapsedMs: 154_000,
    xp: earned ? (scene === "lesson" ? 40 : 15) : 0,
    xpKind: scene === "repeat" ? "repeat" : scene === "rejected" ? "rejected" : earned ? "first" : null,
    xpPending: false,
    totalXp: earned ? 732 : null,
    questUpdate,
    streakDays: scene === "streak" ? 7 : 4,
    celebrateStreak: scene === "streak",
    finishRun,
    failed,
    title: scene === "jump" ? "Nhảy thành công!" : undefined,
    subtitle:
      scene === "jump"
        ? "Lektion 5 đã hoàn thành. Lektion 6 đã mở khóa."
        : scene === "jump-fail"
          ? "Thử lại ngay với bộ câu hỏi mới."
          : undefined,
    continueLabel: "Về bài học",
    onContinue: onClose,
  };
}
