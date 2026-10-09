"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AdminPageHeader, MaterialIcon } from "@/components/admin/AdminShell";
import { CARD, IconTile, INPUT } from "@/components/admin/AdminUi";
import { BadgeUnlockSheet } from "@/components/BadgeParts";
import { DuelEndCard, OpeningCountdown } from "@/components/DuelPlayScreen";
import { BlitzrundeCountdown, BlitzrundeLobby } from "@/components/blitzrunde/BlitzrundeLobby";
import { BlitzrundeResults } from "@/components/blitzrunde/BlitzrundeResults";
import { QuitDialog } from "@/components/session/QuitDialog";
import { FeedbackSheet, SheetLine } from "@/components/session/FeedbackSheet";
import { DictationInputCard } from "@/components/session/DictationInputCard";
import { McCard } from "@/components/session/McCard";
import { NumberInputCard } from "@/components/session/NumberInputCard";
import { PairingCard } from "@/components/session/PairingCard";
import { PartHearts } from "@/components/session/PartHearts";
import { SentenceOrderCard } from "@/components/session/SentenceOrderCard";
import { AudioPlayerCard } from "@/components/session/AudioPlayerCard";
import { TableFillCard } from "@/components/session/grammar/TableFillCard";
import { ClassQuestBoardView } from "@/components/ClassQuestParts";
import { OnboardingTour } from "@/components/onboarding/OnboardingTour";
import { EarnedToast } from "@/components/QuestsScreen";
import { ClassRankClimbStepView, PartCompleteScreen, RankClimbStepView } from "@/components/session/PartCompleteScreen";
import { LessonPathIcon } from "@/app/learn/[levelSlug]/LevelViewClient";
import { freshBadge, type FreshBadge } from "@/lib/badges";
import { BLITZRUNDE_ICON } from "@/lib/blitzrunde";
import type { ParticipantView, StudentRoundView } from "@/lib/blitzrunde-store";
import { duelEndSteps, type DuelEndStep, type DuelView } from "@/lib/duels";
import type { McResult } from "@/lib/multiple-choice";
import { planClassRankClimb, planRankClimb } from "@/lib/rank-climb";
import type { ClassQuestView } from "@/lib/class-quests";
import type { QuestUpdate } from "@/lib/quests";
import { ADMIN_COLORS } from "@/lib/admin-tokens";
import { dropQueuedStreakCelebration, stageStreakCelebration } from "@/lib/useProgress";
import type { ClassBoardRow, LeaderboardRow } from "@/lib/xp";

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
      flags.board ? "class ranking" : null,
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
  | "climb"
  | "class-climb";

const SCENES: readonly { id: SceneId; group: string; icon: string; title: string; detail: string }[] = [
  {
    id: "badge",
    group: "Badges",
    icon: "military_tech",
    title: "One new badge",
    detail: "Full-screen celebration. Does not mark it seen.",
  },
  {
    id: "badges",
    group: "Badges",
    icon: "workspace_premium",
    title: "Two badges in a row",
    detail: "Next, then the done button.",
  },
  {
    id: "tiers",
    group: "Badges",
    icon: "diamond",
    title: "One pose per tier",
    detail: "Đồng, Bạc, Vàng, then Kim cương. Each uses the badge that was earned.",
  },
  {
    id: "fail",
    group: "End of a part",
    icon: "heart_broken",
    title: "Out of hearts",
    detail: "A failed listening part.",
  },
  {
    id: "part",
    group: "End of a part",
    icon: "flag",
    title: "Part complete",
    detail: "With XP. Admins are not ranked, so the class board and class ranking close themselves.",
  },
  {
    id: "lesson",
    group: "End of a part",
    icon: "school",
    title: "Lesson complete",
    detail: "100% and the lesson's XP.",
  },
  {
    id: "repeat",
    group: "End of a part",
    icon: "replay",
    title: "Already counted today",
    detail: "+0 XP because this part already counted.",
  },
  {
    id: "rejected",
    group: "End of a part",
    icon: "block",
    title: "No XP this time",
    detail: "+0 XP. Replay to earn it.",
  },
  {
    id: "jump",
    group: "End of a part",
    icon: "skip_next",
    title: "Jump test passed",
    detail: "The test that skips a Lektion.",
  },
  {
    id: "jump-fail",
    group: "End of a part",
    icon: "undo",
    title: "Jump test failed",
    detail: "The same test, not passed.",
  },
  {
    id: "streak",
    group: "After the part card",
    icon: "local_fire_department",
    title: "Then the streak flame",
    detail: "The count goes from 6 to 7. No practice day is stored.",
  },
  {
    id: "quests",
    group: "After the part card",
    icon: "task_alt",
    title: "Then daily quests",
    detail: "One quest just finished.",
  },
  {
    id: "bonus",
    group: "After the part card",
    icon: "featured_seasonal_and_gifts",
    title: "Then the bonus chest",
    detail: "All three quests for the day.",
  },
  {
    id: "climb",
    group: "After the part card",
    icon: "leaderboard",
    title: "Class board climb",
    detail: "Sample numbers. Does not read the real board.",
  },
  {
    id: "class-climb",
    group: "After the part card",
    icon: "groups",
    title: "Class ranking climb",
    detail: "Your class passes two others. Sample numbers. Does not read the real board.",
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
    userId: name,
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

function sampleClass(
  name: string,
  xp: number,
  members: number,
  rank: number,
  isYours = false,
): ClassBoardRow {
  return {
    rank,
    name,
    xp,
    members,
    xpPerMember: Math.round(xp / members),
    isYours,
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

const SAMPLE_CLASS_CLIMB = planClassRankClimb(
  [
    sampleClass("A1 Tối", 2200, 8, 1),
    sampleClass("A1 Sáng", 1800, 8, 2, true),
    sampleClass("A2 Chiều", 1600, 6, 3),
    sampleClass("B1 Sáng", 1500, 5, 4),
    sampleClass("A1 Chiều", 900, 7, 5),
    sampleClass("A2 Tối", 700, 6, 6),
  ],
  400,
);

type CatalogCategory = "celebrations" | "cards" | "duels" | "blitz" | "sequences" | "session" | "onboarding" | "quests";

type CatalogItem = {
  id: string;
  category: CatalogCategory;
  group: string;
  icon: string;
  title: string;
  detail: string;
};

const CATEGORIES: readonly {
  id: CatalogCategory;
  label: string;
  icon: string;
  color: string;
}[] = [
  { id: "celebrations", label: "Celebrations", icon: "celebration", color: ADMIN_COLORS.amber },
  { id: "cards", label: "Cards", icon: "style", color: ADMIN_COLORS.emerald },
  { id: "duels", label: "Duels", icon: "swords", color: ADMIN_COLORS.cobalt },
  { id: "blitz", label: "Blitzrunde", icon: BLITZRUNDE_ICON, color: ADMIN_COLORS.ember },
  { id: "sequences", label: "Sequences", icon: "account_tree", color: ADMIN_COLORS.violet },
  { id: "session", label: "Session", icon: "widgets", color: ADMIN_COLORS.crimson },
  { id: "onboarding", label: "Onboarding", icon: "route", color: ADMIN_COLORS.cobalt },
  { id: "quests", label: "Quests", icon: "task_alt", color: ADMIN_COLORS.amber },
];

const EXTRA_ITEMS: readonly CatalogItem[] = [
  {
    id: "quest-claims",
    category: "quests",
    group: "Class quests",
    icon: "redeem",
    title: "Quest claims",
    detail: "A sample class board. Nhận XP marks that card claimed here. Nothing is stored.",
  },
  {
    id: "onboarding-tour",
    category: "onboarding",
    group: "Level map",
    icon: "route",
    title: "First-run tour",
    detail: "The five steps over a sample map. Nothing is stored. The last step starts it again.",
  },
  {
    id: "card-choice",
    category: "cards",
    group: "Practice",
    icon: "translate",
    title: "Meaning choice",
    detail: "German sentence, four Vietnamese answers. Checking shows the result band.",
  },
  {
    id: "card-listening",
    category: "cards",
    group: "Practice",
    icon: "hearing",
    title: "Listening choice",
    detail: "A sample clip, then the same four meanings.",
  },
  {
    id: "card-vi",
    category: "cards",
    group: "Practice",
    icon: "spellcheck",
    title: "Vietnamese to German",
    detail: "The prompt is Vietnamese. The options are full sentences.",
  },
  {
    id: "card-order",
    category: "cards",
    group: "Practice",
    icon: "reorder",
    title: "Sentence order",
    detail: "Tap the German words into order. One chip is a distractor.",
  },
  {
    id: "card-pairing",
    category: "cards",
    group: "Practice",
    icon: "join_inner",
    title: "Pairing",
    detail: "Match Vietnamese chips to German chips.",
  },
  {
    id: "card-type",
    category: "cards",
    group: "Practice",
    icon: "keyboard",
    title: "Type the German",
    detail: "A Vietnamese prompt and a text field. The hint names the answer.",
  },
  {
    id: "card-number",
    category: "cards",
    group: "Practice",
    icon: "pin",
    title: "Type a number",
    detail: "Price or time. The hint names the sample answer.",
  },
  {
    id: "card-table",
    category: "cards",
    group: "Grammar",
    icon: "table",
    title: "Verb table",
    detail: "Fill the Präteritum blanks for haben.",
  },
  {
    id: "duel-countdown",
    category: "duels",
    group: "Before the clips",
    icon: "timer",
    title: "Opening countdown",
    detail: "3, 2, 1 against Minh. Nothing is stored.",
  },
  {
    id: "duel-finished",
    category: "duels",
    group: "After your clips",
    icon: "sports_score",
    title: "You finished",
    detail: "Your 15 clips are saved. The duel is still open.",
  },
  {
    id: "duel-waiting",
    category: "duels",
    group: "After your clips",
    icon: "hourglass_top",
    title: "Waiting on Minh",
    detail: "The second card: Minh still has time to play.",
  },
  {
    id: "duel-win",
    category: "duels",
    group: "How it ended",
    icon: "emoji_events",
    title: "You won",
    detail: "9–6, with XP.",
  },
  {
    id: "duel-loss",
    category: "duels",
    group: "How it ended",
    icon: "sentiment_dissatisfied",
    title: "You lost",
    detail: "6–9. A loss still pays XP.",
  },
  {
    id: "duel-tie",
    category: "duels",
    group: "How it ended",
    icon: "handshake",
    title: "Tie",
    detail: "8–8.",
  },
  {
    id: "duel-expired-win",
    category: "duels",
    group: "How it ended",
    icon: "timer_off",
    title: "Opponent missed the deadline",
    detail: "You finished. Minh did not play in time.",
  },
  {
    id: "duel-expired-loss",
    category: "duels",
    group: "How it ended",
    icon: "event_busy",
    title: "You missed the deadline",
    detail: "The challenge closed before you finished.",
  },
  {
    id: "blitz-lobby",
    category: "blitz",
    group: "Before the round",
    icon: "groups",
    title: "Lobby",
    detail: "Four classmates waiting. Sample names, no live round.",
  },
  {
    id: "blitz-countdown",
    category: "blitz",
    group: "Before the round",
    icon: "hourglass_bottom",
    title: "Start countdown",
    detail: "3, 2, 1, Bắt đầu.",
  },
  {
    id: "blitz-win",
    category: "blitz",
    group: "Results",
    icon: "emoji_events",
    title: "First place",
    detail: "You take the top of the podium.",
  },
  {
    id: "blitz-podium",
    category: "blitz",
    group: "Results",
    icon: "military_tech",
    title: "Third place",
    detail: "You are on the podium, not first.",
  },
  {
    id: "blitz-finish",
    category: "blitz",
    group: "Results",
    icon: "flag",
    title: "Finished off the podium",
    detail: "Fifth of five. The podium is other people.",
  },
  {
    id: "blitz-practice",
    category: "blitz",
    group: "Results",
    icon: "fitness_center",
    title: "Unranked practice",
    detail: "The same podium, marked as not counting.",
  },
  {
    id: "session-quit",
    category: "session",
    group: "Chrome",
    icon: "logout",
    title: "Quit sheet",
    detail: "Đợi đã, over a lesson. Stay or end both close the preview.",
  },
  {
    id: "session-hearts",
    category: "session",
    group: "Chrome",
    icon: "favorite",
    title: "Hearts left",
    detail: "Two of three hearts.",
  },
  {
    id: "session-hearts-break",
    category: "session",
    group: "Chrome",
    icon: "heart_broken",
    title: "A heart breaks",
    detail: "The middle heart plays the break.",
  },
  {
    id: "session-correct",
    category: "session",
    group: "Feedback",
    icon: "check_circle",
    title: "Correct band",
    detail: "The green sheet under a sentence.",
  },
  {
    id: "session-wrong",
    category: "session",
    group: "Feedback",
    icon: "cancel",
    title: "Wrong band",
    detail: "The red sheet, with the right sentence.",
  },
];

function sequenceIcon(flags: SequenceFlags): string {
  if (flags.badge && flags.board) return "account_tree";
  if (flags.badge) return "military_tech";
  if (flags.board) return "leaderboard";
  if (flags.quests) return "task_alt";
  return "local_fire_department";
}

const CATALOG: readonly CatalogItem[] = [
  ...SCENES.map((entry) => ({
    id: entry.id,
    category: "celebrations" as const,
    group: entry.group,
    icon: entry.icon,
    title: entry.title,
    detail: entry.detail,
  })),
  ...EXTRA_ITEMS,
  ...SEQUENCES.map((entry) => ({
    id: entry.id,
    category: "sequences" as const,
    group: `${entry.steps} steps`,
    icon: sequenceIcon(entry.flags),
    title: entry.title,
    detail: entry.detail,
  })),
];

function isSceneId(id: string): id is SceneId {
  return SCENES.some((entry) => entry.id === id);
}

export function AdminPreviews() {
  const [category, setCategory] = useState<CatalogCategory>("celebrations");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const scene = openId && isSceneId(openId) ? openId : null;
  const sequence = SEQUENCES.find((entry) => entry.id === openId)?.flags ?? null;
  const close = useCallback(() => {
    dropQueuedStreakCelebration();
    setOpenId(null);
  }, []);

  useEffect(() => {
    if (scene !== "streak" && !sequence?.streak) return;
    stageStreakCelebration({ from: 6, to: 7 });
    return () => dropQueuedStreakCelebration();
  }, [scene, sequence]);

  useEffect(() => {
    if (!openId) return;
    document.body.dataset.adminPreview = "1";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      delete document.body.dataset.adminPreview;
      window.removeEventListener("keydown", onKey);
    };
  }, [openId, close]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      CATALOG.filter((entry) => {
        if (!needle) return entry.category === category;
        const categoryLabel = CATEGORIES.find((item) => item.id === entry.category)?.label ?? "";
        return `${entry.title} ${entry.detail} ${entry.group} ${categoryLabel}`.toLowerCase().includes(needle);
      }),
    [category, needle],
  );
  const groups = [...new Set(visible.map((entry) => (needle ? entry.category : entry.group)))];
  const active = CATEGORIES.find((entry) => entry.id === category) ?? CATEGORIES[0];

  return (
    <main className="flex w-full flex-1 flex-col gap-space-20 px-space-16 py-space-24 sm:px-space-24 min-[1440px]:px-space-32">
      <AdminPageHeader
        kicker="System"
        title="Previews"
        subtitle="Opens the screen a learner sees, with sample numbers. Stores no XP, badge, or progress."
      />
      <div className="flex flex-col gap-space-16">
        <div className="-mx-space-16 flex gap-space-8 overflow-x-auto px-space-16 pb-1 sm:mx-0 sm:px-0">
          {CATEGORIES.map((entry) => {
            const selected = !needle && entry.id === category;
            const count = CATALOG.filter((item) => item.category === entry.id).length;
            return (
              <button
                key={entry.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setCategory(entry.id);
                  setQuery("");
                }}
                className={`flex w-[5.75rem] shrink-0 flex-col items-center gap-2 rounded-admin-card px-2 py-3 text-center transition-colors ${
                  selected ? "bg-admin-card shadow-admin-card" : "hover:bg-admin-card/70"
                }`}
              >
                <span
                  className="flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${entry.color}14`, color: entry.color }}
                >
                  <MaterialIcon name={entry.icon} className="text-[26px]" filled={selected} />
                </span>
                <span className={`text-[12px] font-semibold leading-tight ${selected ? "text-admin-ink" : "text-admin-ink-subtle"}`}>
                  {entry.label}
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-admin-ink-faint">{count}</span>
              </button>
            );
          })}
        </div>
        <label className="relative block max-w-md">
          <span className="sr-only">Find a preview</span>
          <MaterialIcon
            name="search"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[18px] text-admin-ink-faint"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Find a screen in ${active.label.toLowerCase()}, or search all`}
            className={`${INPUT} pl-10`}
          />
        </label>
      </div>
      {visible.length === 0 ? (
        <p className="text-admin-body-md text-admin-ink-subtle">No screen matches “{query.trim()}”.</p>
      ) : (
        groups.map((group) => {
          const items = visible.filter((entry) => (needle ? entry.category : entry.group) === group);
          const heading = needle
            ? (CATEGORIES.find((entry) => entry.id === group)?.label ?? group)
            : group;
          const color = needle
            ? CATEGORIES.find((entry) => entry.id === group)?.color
            : active.color;
          return (
            <section key={group} className="flex flex-col gap-space-12">
              <h2 className="flex items-center gap-2 text-admin-label-sm uppercase text-admin-ink-subtle">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                {heading}
              </h2>
              <ul className="grid gap-space-12 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => setOpenId(entry.id)}
                      className={`${CARD} flex h-full w-full items-start gap-space-12 px-space-16 py-space-12 text-left transition-colors hover:border-admin-border`}
                    >
                      <IconTile icon={entry.icon} color={color} size="lg" />
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="text-admin-body-md font-semibold text-admin-ink">{entry.title}</span>
                        <span className="text-admin-body-sm text-admin-ink-subtle">{entry.detail}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
      {openId ? <OpenPreview id={openId} onClose={close} /> : null}
    </main>
  );
}

function OpenPreview({ id, onClose }: { id: string; onClose: () => void }) {
  if (isSceneId(id)) return <PreviewStage scene={id} onClose={onClose} />;
  const sequence = SEQUENCES.find((entry) => entry.id === id);
  if (sequence) return <SequencePreview flags={sequence.flags} onClose={onClose} />;
  if (id === "card-choice" || id === "card-listening" || id === "card-vi") {
    return <ChoicePreview kind={id} onClose={onClose} />;
  }
  if (id === "card-order") return <OrderPreview onClose={onClose} />;
  if (id === "card-pairing") return <PairingPreview onClose={onClose} />;
  if (id === "card-type") return <DictationPreview onClose={onClose} />;
  if (id === "card-number") return <NumberPreview onClose={onClose} />;
  if (id === "card-table") return <TablePreview onClose={onClose} />;
  if (id === "duel-countdown") {
    return (
      <PreviewChrome onClose={onClose}>
        <OpeningCountdown duelId="preview" opponentName="Minh" onDone={() => {}} />
      </PreviewChrome>
    );
  }
  if (id.startsWith("duel-")) return <DuelPreview id={id} onClose={onClose} />;
  if (id === "blitz-lobby") {
    return (
      <PreviewChrome onClose={onClose}>
        <div className="h-full overflow-y-auto px-4 pt-16 pb-8">
          <div className="mx-auto w-full max-w-md">
            <BlitzrundeLobby round={SAMPLE_LOBBY} />
          </div>
        </div>
      </PreviewChrome>
    );
  }
  if (id === "blitz-countdown") {
    return (
      <PreviewChrome onClose={onClose}>
        <BlitzrundeCountdown onDone={() => {}} />
      </PreviewChrome>
    );
  }
  if (id.startsWith("blitz-")) return <BlitzResultsPreview id={id} onClose={onClose} />;
  if (id === "quest-claims") return <QuestClaimsPreview onClose={onClose} />;
  if (id === "onboarding-tour") return <OnboardingPreview onClose={onClose} />;
  if (id === "session-quit") {
    return (
      <PreviewChrome onClose={onClose}>
        <div className="flex h-full items-center justify-center px-6 text-center">
          <p className="text-[22px] font-bold text-[#1d1d1f]">Lektion 1 · Phần 2</p>
        </div>
        <QuitDialog message="Bạn sẽ mất tiến trình phần này." onStay={onClose} onQuit={onClose} />
      </PreviewChrome>
    );
  }
  if (id === "session-hearts" || id === "session-hearts-break") {
    const breaking = id === "session-hearts-break";
    return (
      <PreviewChrome onClose={onClose}>
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <PartHearts remaining={breaking ? 1 : 2} total={3} breakingIndex={breaking ? 1 : null} />
          <p className="text-[15px] font-bold text-[#86868b]">{breaking ? "Một tim vừa mất" : "Còn 2 trên 3 tim"}</p>
        </div>
      </PreviewChrome>
    );
  }
  if (id === "session-correct" || id === "session-wrong") {
    const correct = id === "session-correct";
    return (
      <PreviewChrome onClose={onClose}>
        <div className="mx-auto flex w-full max-w-2xl flex-col px-6 pt-24">
          <p className="text-[22px] font-bold text-[#1d1d1f]">Ich hätte Kopfschmerzen.</p>
        </div>
        <FeedbackSheet
          tone={correct ? "correct" : "wrong"}
          title={correct ? "Chính xác!" : "Chưa đúng"}
          actionLabel="Tiếp tục"
          onAction={onClose}
        >
          <SheetLine script="Ich hätte Kopfschmerzen." translation="Tôi bị đau đầu." />
        </FeedbackSheet>
      </PreviewChrome>
    );
  }
  return null;
}

const SAMPLE_DAILY: readonly ClassQuestView[] = [
  {
    id: "parts-2",
    period: "day",
    title: "Cả lớp hoàn thành 12 phần luyện tập",
    icon: "fitness_center",
    xp: 25,
    target: 12,
    progress: 12,
    done: true,
    contributors: [
      { name: "Lan", image: null, amount: 3 },
      { name: "Minh", image: null, amount: 3 },
      { name: "An", image: null, amount: 2 },
      { name: "Hà", image: null, amount: 4 },
    ],
    showAmounts: true,
    youContributed: true,
    claimed: false,
    claimable: true,
  },
  {
    id: "practice-60",
    period: "day",
    title: "4 bạn trong lớp luyện tập hôm nay",
    icon: "groups",
    xp: 25,
    target: 4,
    progress: 2,
    done: false,
    contributors: [
      { name: "Lan", image: null, amount: 1 },
      { name: "Minh", image: null, amount: 1 },
    ],
    showAmounts: false,
    youContributed: true,
    claimed: false,
    claimable: false,
  },
];

const SAMPLE_WEEKLY: readonly ClassQuestView[] = [
  {
    id: "xp-1000",
    period: "week",
    title: "Cả lớp kiếm 1000 XP tuần này",
    icon: "bolt",
    xp: 80,
    target: 1000,
    progress: 1000,
    done: true,
    contributors: [
      { name: "Lan", image: null, amount: 420 },
      { name: "An", image: null, amount: 310 },
      { name: "Hà", image: null, amount: 270 },
    ],
    showAmounts: true,
    youContributed: false,
    claimed: false,
    claimable: false,
  },
];

function markClaimed(quests: readonly ClassQuestView[], id: string): ClassQuestView[] {
  return quests.map((quest) => (quest.id === id ? { ...quest, claimed: true, claimable: false } : quest));
}

/** Sample class quests. Claiming only changes this preview. */
function QuestClaimsPreview({ onClose }: { onClose: () => void }) {
  const [daily, setDaily] = useState<readonly ClassQuestView[]>(SAMPLE_DAILY);
  const [weekly, setWeekly] = useState<readonly ClassQuestView[]>(SAMPLE_WEEKLY);
  const [toast, setToast] = useState<QuestUpdate | null>(null);
  const claim = (id: string) => {
    const quest = [...daily, ...weekly].find((entry) => entry.id === id);
    if (!quest?.claimable) return;
    setDaily((current) => markClaimed(current, id));
    setWeekly((current) => markClaimed(current, id));
    setToast({ xp: quest.xp, completed: [], bonus: false, quests: [] });
  };

  return (
    <PreviewChrome onClose={onClose}>
      {toast ? <EarnedToast update={toast} onDone={() => setToast(null)} /> : null}
      <div className="h-full overflow-y-auto bg-[#faf8ff] px-4 pt-16 pb-10">
        <div className="mx-auto w-full max-w-md">
          <ClassQuestBoardView
            headerAside={
              <span className="min-w-0 truncate text-[13px] font-bold text-[#6e6e73]">A1 Sáng · 6 bạn</span>
            }
            daily={daily}
            weekly={weekly}
            dayCountdown="Còn 6 giờ"
            weekCountdown="Còn 3 ngày"
            observing={false}
            claiming={null}
            onClaim={claim}
            onPractice={() => {}}
          />
        </div>
      </div>
    </PreviewChrome>
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="fixed top-[max(0.75rem,env(safe-area-inset-top))] right-4 z-[120] rounded-full border border-[#e5e5ea] bg-white px-3 py-1.5 text-[13px] font-extrabold text-[#1d1d1f] shadow-[0_2px_0_0_#e5e5ea]"
    >
      Close
    </button>
  );
}

const PATH_VARS = {
  "--path-accent": "#0284c7",
  "--path-accent-deep": "#0369a1",
  "--path-accent-light": "#0ea5e9",
  "--path-guide": "#1cb0f6",
  "--path-node": "#3A81C6",
  "--path-node-lip": "#2C679F",
} as CSSProperties;

function GuideBubble({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute top-1 left-1/2 z-20 -translate-x-1/2">
      <div className="flex flex-col items-center drop-shadow-[0_8px_14px_rgba(28,27,31,0.14)]">
        <span className="rounded-2xl bg-white px-3 py-1.5 text-[13px] font-extrabold tracking-[0.06em] whitespace-nowrap text-[var(--path-guide)] uppercase">
          {label}
        </span>
        <svg viewBox="0 0 20 9" className="-mt-px h-[9px] w-5" aria-hidden="true">
          <path d="M0 0 H20 L10 9 Z" fill="#ffffff" />
        </svg>
      </div>
    </div>
  );
}

function SamplePathNode({
  tour,
  icon,
  label,
  guide,
  locked,
  shift,
}: {
  tour?: string;
  icon: string;
  label: string;
  guide?: string;
  locked?: boolean;
  shift: number;
}) {
  return (
    <li
      data-tour={tour}
      className={`relative ${guide ? "pt-14" : ""}`}
      style={{ transform: `translateX(${shift}px)` }}
    >
      {guide ? <GuideBubble label={guide} /> : null}
      <div className="flex max-w-[10.5rem] flex-col items-center text-center">
        {locked ? (
          <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/70 bg-[#e2e8f0] text-[#94a3b8] shadow-[0_6px_0_0_#cbd5e1]">
            <span className="opacity-45 grayscale">
              <LessonPathIcon name={icon} onWhite className="relative h-10 w-10" />
            </span>
          </span>
        ) : (
          <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white bg-white shadow-[0_6px_0_0_#bec8d2]">
            <LessonPathIcon name={icon} onWhite className="relative h-10 w-10" />
          </span>
        )}
        <span
          className={`mt-1.5 text-[12px] font-bold leading-4 ${locked ? "text-[#6e7881]" : "text-[var(--path-accent-deep)]"}`}
        >
          {label}
        </span>
      </div>
    </li>
  );
}

/**
 * The real tour, pointed at a sample map. Finishing does not stamp
 * onboarding; it starts the steps again.
 */
function OnboardingPreview({ onClose }: { onClose: () => void }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0);
  const restart = () => {
    scrollerRef.current?.scrollTo({ top: 0 });
    setRun((value) => value + 1);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-[#fbfbfd]" style={PATH_VARS}>
      <CloseButton onClose={onClose} />
      <div ref={scrollerRef} className="h-full overflow-y-auto">
        <header className="sticky top-0 z-40 border-b border-black/[0.05] bg-[#fbfbfd]/80 pt-safe backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-4xl items-center px-6">
            <button
              type="button"
              data-tour="course"
              className="flex max-w-[11rem] items-center gap-0.5 text-[#0066cc]"
            >
              <span className="truncate text-[17px] font-medium tracking-tight">A1</span>
              <MaterialIcon name="expand_more" className="text-[22px]" />
            </button>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-6 pt-8 pb-24">
          <div className="rounded-2xl bg-gradient-to-br from-[var(--path-accent)] to-[var(--path-accent-light)] p-4 text-white shadow-[0_6px_0_0_var(--path-accent-deep)]">
            <p className="text-[12px] font-bold tracking-wide text-sky-100 uppercase">A1</p>
            <h2 className="mt-1 text-[22px] font-extrabold leading-7">Luyện nghe</h2>
          </div>
          <section className="flex flex-col items-center">
            <div className="flex w-full flex-col gap-2 rounded-2xl bg-white p-4 shadow-[0_4px_0_0_var(--path-accent)]">
              <h3 className="text-[20px] font-extrabold leading-7 tracking-tight text-[#131b2e]">A1 - Lektion 1</h3>
              <p className="text-[13px] font-bold leading-5 text-[var(--path-accent)]">Lektion hiện tại</p>
            </div>
            <ul className="relative flex w-full flex-col items-center gap-3 py-3">
              <SamplePathNode tour="video" icon="smart_display" label="Video" guide="Bắt đầu" shift={-40} />
              <SamplePathNode tour="study" icon="menu_book" label="Học từ vựng" shift={-72} />
              <SamplePathNode tour="practice" icon="fitness_center" label="Luyện tập" locked shift={-40} />
            </ul>
          </section>
          <section className="flex flex-col items-center">
            <div className="flex w-full flex-col gap-2 rounded-2xl bg-white p-4 shadow-[0_4px_0_0_#dae2fd]">
              <h3 className="text-[20px] font-extrabold leading-7 tracking-tight text-[#6e7881]">A1 - Lektion 2</h3>
              <p className="text-[13px] font-medium leading-5 text-[#6e7881]">Xong Lektion 1 trước đã</p>
            </div>
            <ul className="relative flex w-full flex-col items-center py-3">
              <li data-tour="jump" className="relative pt-14" style={{ transform: "translateX(0px)" }}>
                <GuideBubble label="Nhảy tới đây?" />
                <span className="relative flex h-[70px] w-[70px] items-center justify-center rounded-full border-t-2 border-white/40 bg-[var(--path-node)] text-white shadow-[0_7px_0_0_var(--path-node-lip)]">
                  <svg viewBox="0 0 64 64" className="h-10 w-10" aria-hidden="true">
                    <path
                      d="M12 18 L31 32 L12 46 Z M33 18 L52 32 L33 46 Z"
                      fill="#FFFFFF"
                      stroke="#FFFFFF"
                      strokeWidth="5"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
      <OnboardingTour key={run} onFinish={restart} />
    </div>
  );
}

function PreviewChrome({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] bg-[#faf8ff]">
      <CloseButton onClose={onClose} />
      {children}
    </div>
  );
}

function CardStage({
  hint,
  onClose,
  children,
}: {
  hint?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <PreviewChrome onClose={onClose}>
      <div className="h-full overflow-y-auto pt-[calc(env(safe-area-inset-top)+3.5rem)]">
        <div className="mx-auto flex w-full max-w-2xl flex-col px-4 pb-8 sm:px-6">
          {hint ? <p className="mb-4 text-center text-[13px] font-bold text-[#86868b]">{hint}</p> : null}
          {children}
        </div>
      </div>
    </PreviewChrome>
  );
}

function PreviewStage({ scene, onClose }: { scene: SceneId; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80]">
      <CloseButton onClose={onClose} />
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
      {scene === "class-climb" && SAMPLE_CLASS_CLIMB ? (
        <ClassRankClimbStepView
          climb={SAMPLE_CLASS_CLIMB}
          countdown="Còn 3 ngày"
          contributionBefore={80}
          contributionAfter={480}
          continueLabel="Về bài học"
          onContinue={onClose}
        />
      ) : null}
      {scene !== "badge" &&
      scene !== "badges" &&
      scene !== "tiers" &&
      scene !== "climb" &&
      scene !== "class-climb" ? (
        <PartCompleteScreen key={scene} {...partProps(scene, onClose)} />
      ) : null}
    </div>
  );
}

function SequencePreview({ flags, onClose }: { flags: SequenceFlags; onClose: () => void }) {
  const [step, setStep] = useState<"part" | "board" | "classes" | "badge">("part");
  const afterPart = () => {
    if (flags.board) setStep("board");
    else if (flags.badge) setStep("badge");
    else onClose();
  };
  const afterBoard = () => {
    if (SAMPLE_CLASS_CLIMB) setStep("classes");
    else if (flags.badge) setStep("badge");
    else onClose();
  };
  const afterClasses = () => {
    if (flags.badge) setStep("badge");
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-[80]">
      <CloseButton onClose={onClose} />
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
          continueLabel="Tiếp tục"
          onContinue={afterBoard}
        />
      ) : null}
      {step === "classes" && SAMPLE_CLASS_CLIMB ? (
        <ClassRankClimbStepView
          climb={SAMPLE_CLASS_CLIMB}
          countdown="Còn 3 ngày"
          contributionBefore={80}
          contributionAfter={480}
          continueLabel={flags.badge ? "Tiếp tục" : "Về bài học"}
          onContinue={afterClasses}
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

function GradeBand({
  correct,
  title,
  onAgain,
  children,
}: {
  correct: boolean;
  title: string;
  onAgain: () => void;
  children: ReactNode;
}) {
  return (
    <FeedbackSheet tone={correct ? "correct" : "wrong"} title={title} actionLabel="Xem lại" onAction={onAgain}>
      {children}
    </FeedbackSheet>
  );
}

const MEANING_OPTIONS = [
  { id: "a", text: "Tôi bị đau bụng.", correct: false },
  { id: "b", text: "Tôi bị đau đầu.", correct: true },
  { id: "c", text: "Tôi bị sốt.", correct: false },
  { id: "d", text: "Tôi bị ho.", correct: false },
];

const GERMAN_OPTIONS = [
  { id: "a", text: "Ich habe Kopfschmerzen.", correct: false },
  { id: "b", text: "Ich hätte Kopfschmerzen.", correct: true },
  { id: "c", text: "Ich bin krank.", correct: false },
  { id: "d", text: "Ich hätte Fieber.", correct: false },
];

const SAMPLE_AUDIO = "/audio/a1-2/lektion-1/a12-l1-gram-03-er-hatte-kopfschmerzen.mp3";

function ChoicePreview({
  kind,
  onClose,
}: {
  kind: "card-choice" | "card-listening" | "card-vi";
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<McResult | null>(null);
  const listening = kind === "card-listening";
  const vietnamese = kind === "card-vi";
  const options = vietnamese ? GERMAN_OPTIONS : MEANING_OPTIONS;
  const correctId = options.find((option) => option.correct)?.id ?? "b";
  const right = result?.selectedId === correctId;
  return (
    <CardStage
      onClose={onClose}
      hint={listening ? "Sample clip. The right meaning is đau đầu." : undefined}
    >
      <McCard
        key={attempt}
        icon={listening ? "hearing" : vietnamese ? "spellcheck" : "translate"}
        layout={vietnamese ? "list" : "grid"}
        eyebrow={listening ? "Nghe · Hören" : vietnamese ? "Chọn câu tiếng Đức" : "Chọn nghĩa"}
        prompt={vietnamese ? "Tôi bị đau đầu." : listening ? "Nghe và chọn nghĩa đúng" : "Ich hätte Kopfschmerzen."}
        options={options}
        result={result}
        afterPrompt={listening ? <AudioPlayerCard audioPath={SAMPLE_AUDIO} /> : undefined}
        onSubmit={(selectedId) =>
          setResult({
            accuracy: selectedId === correctId ? 100 : 0,
            selectedId,
            correctId,
          })
        }
      />
      {result ? (
        <GradeBand
          correct={right}
          title={right ? "Chính xác!" : "Đáp án đúng"}
          onAgain={() => {
            setResult(null);
            setAttempt((value) => value + 1);
          }}
        >
          <SheetLine script="Ich hätte Kopfschmerzen." translation="Tôi bị đau đầu." />
        </GradeBand>
      ) : null}
    </CardStage>
  );
}

const ORDER_ANSWER = ["Ich", "hätte", "gestern", "Kopfschmerzen."];

function OrderPreview({ onClose }: { onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [locked, setLocked] = useState(false);
  const [correct, setCorrect] = useState(false);
  return (
    <CardStage onClose={onClose}>
      <SentenceOrderCard
        key={attempt}
        translation="Hôm qua tôi bị đau đầu."
        chips={[
          { id: "1", text: "hätte" },
          { id: "2", text: "Ich" },
          { id: "3", text: "Kopfschmerzen." },
          { id: "4", text: "gestern" },
          { id: "5", text: "hatte" },
        ]}
        locked={locked}
        onSubmit={(selected) => {
          setCorrect(selected.join(" ") === ORDER_ANSWER.join(" "));
          setLocked(true);
        }}
      />
      {locked ? (
        <GradeBand
          correct={correct}
          title={correct ? "Chính xác!" : "Thứ tự đúng"}
          onAgain={() => {
            setLocked(false);
            setAttempt((value) => value + 1);
          }}
        >
          <SheetLine script="Ich hätte gestern Kopfschmerzen." translation="Hôm qua tôi bị đau đầu." />
        </GradeBand>
      ) : null}
    </CardStage>
  );
}

function PairingPreview({ onClose }: { onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  return (
    <CardStage key={attempt} onClose={onClose}>
      <PairingCard
        items={[
          { id: "1", vi: "đau đầu", de: "Kopfschmerzen" },
          { id: "2", vi: "hôm qua", de: "gestern" },
          { id: "3", vi: "anh ấy đã có", de: "er hatte" },
        ]}
        onMistake={() => {}}
        onSolved={() => {}}
        onNext={() => setAttempt((value) => value + 1)}
      />
    </CardStage>
  );
}

const DICTATION_ANSWER = "Er hatte gestern Kopfschmerzen.";

function DictationPreview({ onClose }: { onClose: () => void }) {
  const [value, setValue] = useState("");
  const [graded, setGraded] = useState<boolean | null>(null);
  return (
    <CardStage onClose={onClose} hint={`Câu đúng: ${DICTATION_ANSWER}`}>
      <DictationInputCard
        prompt="Hôm qua anh ấy bị đau đầu."
        value={value}
        onChange={setValue}
        disabled={graded !== null}
        showSubmit={graded === null}
        onSubmit={(typed) => setGraded(typed.trim().toLowerCase() === DICTATION_ANSWER.toLowerCase())}
      />
      {graded !== null ? (
        <GradeBand
          correct={graded}
          title={graded ? "Chính xác!" : "Câu đúng"}
          onAgain={() => {
            setGraded(null);
            setValue("");
          }}
        >
          <SheetLine script={DICTATION_ANSWER} translation="Hôm qua anh ấy bị đau đầu." />
        </GradeBand>
      ) : null}
    </CardStage>
  );
}

function NumberPreview({ onClose }: { onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [locked, setLocked] = useState(false);
  const [correct, setCorrect] = useState(false);
  return (
    <CardStage onClose={onClose} hint="Giá mẫu là 12,50.">
      <NumberInputCard
        key={attempt}
        locked={locked}
        onSubmit={(typed) => {
          setCorrect(typed.trim() === "12,50");
          setLocked(true);
        }}
      />
      {locked ? (
        <GradeBand
          correct={correct}
          title={correct ? "Chính xác!" : "Số đúng"}
          onAgain={() => {
            setLocked(false);
            setAttempt((value) => value + 1);
          }}
        >
          <p className="font-bold">12,50</p>
        </GradeBand>
      ) : null}
    </CardStage>
  );
}

const TABLE_ROWS = [
  { personLabel: "ich", text: null, answer: "hatte" },
  { personLabel: "du", text: null, answer: "hattest" },
  { personLabel: "er/sie", text: "hatte", answer: "hatte" },
  { personLabel: "wir", text: null, answer: "hatten" },
];

function TablePreview({ onClose }: { onClose: () => void }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ blanks: { correct: boolean }[] } | null>(null);
  const blanks = TABLE_ROWS.filter((row) => row.text === null);
  const correct = result?.blanks.every((blank) => blank.correct) ?? false;
  return (
    <CardStage onClose={onClose}>
      <TableFillCard
        key={attempt}
        verb="haben"
        tense="praeteritum"
        tenseLabel="Präteritum"
        rows={TABLE_ROWS}
        bank={[
          { id: "1", text: "hatte" },
          { id: "2", text: "hattest" },
          { id: "3", text: "hatten" },
          { id: "4", text: "haben" },
        ]}
        result={result}
        onSubmit={(placed) => {
          setResult({
            blanks: blanks.map((row, index) => ({ correct: placed[index] === row.answer })),
          });
        }}
      />
      {result ? (
        <GradeBand
          correct={correct}
          title={correct ? "Chính xác!" : "Các dạng đúng"}
          onAgain={() => {
            setResult(null);
            setAttempt((value) => value + 1);
          }}
        >
          <p className="font-bold">ich hatte · du hattest · wir hatten</p>
        </GradeBand>
      ) : null}
    </CardStage>
  );
}

const DUEL_NOW = new Date("2026-10-08T12:00:00.000Z");

function duelView(patch: Partial<DuelView>): DuelView {
  return {
    id: "preview",
    yourName: "Bạn",
    opponentName: "Minh",
    complete: true,
    yourOutcome: "win",
    yourXp: 15,
    opponentXp: 10,
    yourPoints: 9,
    opponentPoints: 6,
    nextPosition: null,
    startedAt: "2026-10-08T11:00:00.000Z",
    completedAt: "2026-10-08T11:40:00.000Z",
    expired: false,
    expiresAt: "2026-10-10T12:00:00.000Z",
    clips: [],
    ...patch,
  };
}

function duelCase(id: string): { step: DuelEndStep; view: DuelView } | null {
  const open = duelView({
    complete: false,
    yourOutcome: null,
    yourXp: null,
    opponentXp: null,
    yourPoints: 0,
    opponentPoints: 0,
    completedAt: null,
  });
  const views: Record<string, DuelView> = {
    "duel-finished": open,
    "duel-waiting": open,
    "duel-win": duelView({ yourOutcome: "win", yourPoints: 9, opponentPoints: 6, yourXp: 20 }),
    "duel-loss": duelView({ yourOutcome: "loss", yourPoints: 6, opponentPoints: 9, yourXp: 10 }),
    "duel-tie": duelView({ yourOutcome: "tie", yourPoints: 8, opponentPoints: 8, yourXp: 15 }),
    "duel-expired-win": duelView({
      expired: true,
      yourOutcome: "win",
      yourXp: 10,
      yourPoints: 9,
      opponentPoints: 0,
    }),
    "duel-expired-loss": duelView({
      expired: true,
      yourOutcome: "loss",
      yourXp: 5,
      yourPoints: 0,
      opponentPoints: 0,
    }),
  };
  const view = views[id];
  if (!view) return null;
  const steps = duelEndSteps(view, DUEL_NOW);
  const step = id === "duel-waiting" ? steps[1] : steps[0];
  return step ? { step, view } : null;
}

function DuelPreview({ id, onClose }: { id: string; onClose: () => void }) {
  const found = duelCase(id);
  if (!found) return null;
  return (
    <PreviewChrome onClose={onClose}>
      <DuelEndCard
        step={found.step}
        view={found.view}
        primaryLabel="Về đấu"
        onPrimary={onClose}
      />
    </PreviewChrome>
  );
}

function blitzPlayer(name: string, rank: number | null, score: number, you = false): ParticipantView {
  return {
    userId: you ? "you" : name.toLowerCase(),
    name,
    status: rank == null ? "no_result" : "finished",
    joinedAt: "2026-10-08T12:00:00.000Z",
    lastSeenAt: "2026-10-08T12:06:00.000Z",
    lastSeenIndex: 11,
    submittedAt: rank == null ? null : "2026-10-08T12:07:00.000Z",
    finishReason: rank == null ? null : "deck_done",
    finalScore: score,
    answered: 12,
    correct: 9,
    avgMs: 4800,
    longestStreak: you ? 5 : 2,
    completedDeck: rank != null,
    rank,
  };
}

function blitzStandings(id: string): { standings: ParticipantView[]; ranked: boolean } {
  if (id === "blitz-win") {
    return {
      ranked: true,
      standings: [
        blitzPlayer("Bạn", 1, 9800, true),
        blitzPlayer("Minh", 2, 8600),
        blitzPlayer("Hoa", 3, 7100),
        blitzPlayer("An", 4, 5400),
      ],
    };
  }
  if (id === "blitz-podium") {
    return {
      ranked: true,
      standings: [
        blitzPlayer("Lan", 1, 9800),
        blitzPlayer("Minh", 2, 8600),
        blitzPlayer("Bạn", 3, 7100, true),
        blitzPlayer("An", 4, 5400),
      ],
    };
  }
  if (id === "blitz-practice") {
    return {
      ranked: false,
      standings: [
        blitzPlayer("Lan", 1, 9800),
        blitzPlayer("Bạn", 2, 8600, true),
        blitzPlayer("Minh", 3, 7100),
      ],
    };
  }
  return {
    ranked: true,
    standings: [
      blitzPlayer("Lan", 1, 9800),
      blitzPlayer("Minh", 2, 8600),
      blitzPlayer("Hoa", 3, 7100),
      blitzPlayer("An", 4, 5400),
      blitzPlayer("Bạn", 5, 4200, true),
    ],
  };
}

const SAMPLE_LOBBY: StudentRoundView = {
  meta: {
    id: "preview",
    status: "lobby",
    ranked: true,
    classLabel: "A1 Sáng",
    levelSlug: "a1-2",
    chapterSlug: "lektion-1",
    levelLabel: "A1.2",
    lektionLabel: "Lektion 1",
    createdAt: "2026-10-08T12:00:00.000Z",
    startsAt: null,
    endsAt: null,
    endedAt: null,
    endedReason: null,
    deckSize: 18,
    counts: {
      order: 4,
      "multiple-choice": 6,
      "vi-choice": 3,
      "vi-input": 2,
      pairing: 3,
    },
  },
  joined: true,
  classMatches: true,
  deck: null,
  you: {
    ...blitzPlayer("Bạn", null, 0, true),
    status: "waiting",
    finishReason: null,
    submittedAt: null,
    completedDeck: false,
    answered: 0,
    correct: 0,
    longestStreak: 0,
  },
  joinedCount: 4,
  standings: null,
  players: [
    { name: "Bạn", isYou: true, joinedAt: "2026-10-08T12:00:00.000Z" },
    { name: "Minh", isYou: false, joinedAt: "2026-10-08T12:00:05.000Z" },
    { name: "Lan", isYou: false, joinedAt: "2026-10-08T12:00:12.000Z" },
    { name: "Hoa", isYou: false, joinedAt: "2026-10-08T12:00:20.000Z" },
  ],
};

function BlitzResultsPreview({ id, onClose }: { id: string; onClose: () => void }) {
  const { standings, ranked } = blitzStandings(id);
  return (
    <PreviewChrome onClose={onClose}>
      <div className="h-full overflow-y-auto px-4 pt-16 pb-8">
        <div className="mx-auto w-full max-w-md">
          <BlitzrundeResults standings={standings} youId="you" ranked={ranked} fallbackScore={0} />
        </div>
      </div>
    </PreviewChrome>
  );
}
