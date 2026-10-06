/**
 * Badges a learner collects.
 * Every badge family counts one stat the server already tracks (XP, finished
 * parts, streak, quests, duels, Blitzrunde, finished weeks on the class
 * board). Each family has four tiers. A tier is earned once the stat reaches
 * its target, and stays earned after that, even if the stat later drops.
 *
 * This file is pure. `badge-store.ts` counts the stats and stores awards. The
 * browser never reports a stat or claims a badge.
 */

export type BadgeStats = {
  /** All-time XP from every source, quests included. */
  totalXp: number;
  /** Listening parts that earned XP. */
  listeningParts: number;
  /** Finished listening parts with 100% accuracy. */
  perfectParts: number;
  /** Study parts that earned XP. */
  studyParts: number;
  /** Lektionen with every practice part finished. */
  lessonsDone: number;
  /** Longest run of consecutive practice days ever. */
  bestStreak: number;
  /** Days with all three daily quests done. */
  questBonusDays: number;
  duelWins: number;
  /** Top 3 finishes in ranked Blitzrunde rounds. */
  blitzPodiums: number;
  /** Finished weeks in the top 3 of the class XP board. */
  weekTop3: number;
  /** Finished weeks in first place of the class XP board. */
  weekFirst: number;
};

export const EMPTY_BADGE_STATS: BadgeStats = {
  totalXp: 0,
  listeningParts: 0,
  perfectParts: 0,
  studyParts: 0,
  lessonsDone: 0,
  bestStreak: 0,
  questBonusDays: 0,
  duelWins: 0,
  blitzPodiums: 0,
  weekTop3: 0,
  weekFirst: 0,
};

export type BadgeGroup = "learning" | "habit" | "compete";

export type BadgeFamily = {
  id: string;
  group: BadgeGroup;
  stat: keyof BadgeStats;
  title: string;
  /** Material Symbols name. */
  icon: string;
  /** Face color of the medal. */
  color: string;
  /** Four rising targets, one per tier. */
  targets: readonly [number, number, number, number];
  /** What reaching `target` means, for a locked or earned tier. */
  goal: (target: number) => string;
};

/** Tier 1 is Đồng. Colors match the medal metals in the badge design. */
export const BADGE_TIERS = [
  { name: "Đồng", ring: "#C97B4A", lip: "#9A5630", glow: "#E8AE88" },
  { name: "Bạc", ring: "#AEB8C6", lip: "#7C8898", glow: "#DDE4ED" },
  { name: "Vàng", ring: "#FFC83D", lip: "#D99A00", glow: "#FFE9A6" },
  { name: "Kim cương", ring: "#5CC8F5", lip: "#2A93D1", glow: "#C4EEFF" },
] as const;

export const BADGE_GROUPS: readonly { id: BadgeGroup; title: string }[] = [
  { id: "learning", title: "Học tập" },
  { id: "habit", title: "Thói quen" },
  { id: "compete", title: "Thi đấu & xếp hạng" },
];

export const BADGE_FAMILIES: readonly BadgeFamily[] = [
  {
    id: "xp",
    group: "learning",
    stat: "totalXp",
    title: "Cỗ máy XP",
    icon: "bolt",
    color: "#FF9500",
    targets: [500, 2000, 5000, 15000],
    goal: (n) => `Kiếm tổng cộng ${n.toLocaleString("vi-VN")} XP`,
  },
  {
    id: "listening",
    group: "learning",
    stat: "listeningParts",
    title: "Đôi tai vàng",
    icon: "headphones",
    color: "#0071E3",
    targets: [10, 50, 150, 400],
    goal: (n) => `Hoàn thành ${n} phần luyện nghe`,
  },
  {
    id: "perfect",
    group: "learning",
    stat: "perfectParts",
    title: "Không tì vết",
    icon: "verified",
    color: "#AF52DE",
    targets: [1, 10, 30, 100],
    goal: (n) => (n === 1 ? "Đạt 100% một phần luyện nghe" : `Đạt 100% ở ${n} phần luyện nghe`),
  },
  {
    id: "study",
    group: "learning",
    stat: "studyParts",
    title: "Mọt sách",
    icon: "menu_book",
    color: "#34C759",
    targets: [10, 50, 150, 400],
    goal: (n) => `Hoàn thành ${n} phần học từ vựng`,
  },
  {
    id: "lessons",
    group: "learning",
    stat: "lessonsDone",
    title: "Nhà chinh phục",
    icon: "flag",
    color: "#FF2D55",
    targets: [1, 5, 15, 40],
    goal: (n) => (n === 1 ? "Hoàn thành 1 Lektion" : `Hoàn thành ${n} Lektion`),
  },
  {
    id: "streak",
    group: "habit",
    stat: "bestStreak",
    title: "Ngọn lửa bền bỉ",
    icon: "local_fire_department",
    color: "#FF6B00",
    targets: [3, 7, 30, 100],
    goal: (n) => `Học ${n} ngày liên tiếp`,
  },
  {
    id: "quests",
    group: "habit",
    stat: "questBonusDays",
    title: "Thợ săn nhiệm vụ",
    icon: "redeem",
    color: "#D97706",
    targets: [1, 7, 30, 100],
    goal: (n) => (n === 1 ? "Mở rương thưởng nhiệm vụ 1 lần" : `Mở rương thưởng nhiệm vụ ${n} ngày`),
  },
  {
    id: "duel",
    group: "compete",
    stat: "duelWins",
    title: "Đấu sĩ",
    icon: "swords",
    color: "#E11D48",
    targets: [1, 10, 30, 100],
    goal: (n) => (n === 1 ? "Thắng 1 trận đấu" : `Thắng ${n} trận đấu`),
  },
  {
    id: "blitz",
    group: "compete",
    stat: "blitzPodiums",
    title: "Tia chớp",
    icon: "electric_bolt",
    color: "#5856D6",
    targets: [1, 5, 15, 40],
    goal: (n) => (n === 1 ? "Vào top 3 một vòng Blitzrunde" : `Vào top 3 ở ${n} vòng Blitzrunde`),
  },
  {
    id: "podium",
    group: "compete",
    stat: "weekTop3",
    title: "Bục vinh quang",
    icon: "military_tech",
    color: "#0A84FF",
    targets: [1, 3, 10, 25],
    goal: (n) => (n === 1 ? "Kết thúc 1 tuần trong top 3 của lớp" : `Kết thúc ${n} tuần trong top 3 của lớp`),
  },
  {
    id: "champion",
    group: "compete",
    stat: "weekFirst",
    title: "Quán quân tuần",
    icon: "trophy",
    color: "#F5B400",
    targets: [1, 3, 10, 25],
    goal: (n) => (n === 1 ? "Đứng nhất lớp 1 tuần" : `Đứng nhất lớp ${n} tuần`),
  },
];

export const BADGE_COUNT = BADGE_FAMILIES.length * BADGE_TIERS.length;

/** `streak-2` is the Silver streak badge. Tiers are 1-based. */
export function badgeId(familyId: string, tier: number): string {
  return `${familyId}-${tier}`;
}

export function parseBadgeId(id: string): { family: BadgeFamily; tier: number } | null {
  const match = /^([a-z]+)-([1-4])$/.exec(id);
  if (!match) return null;
  const family = BADGE_FAMILIES.find((entry) => entry.id === match[1]);
  return family ? { family, tier: Number(match[2]) } : null;
}

/** Highest tier `value` reaches, 0 when none. */
export function tierFor(family: BadgeFamily, value: number): number {
  return family.targets.filter((target) => value >= target).length;
}

/** Badge ids the stats reach that are not stored yet, lowest tier first. */
export function badgesToAward(stats: BadgeStats, owned: ReadonlySet<string>): string[] {
  const ids: string[] = [];
  for (const family of BADGE_FAMILIES) {
    const reached = tierFor(family, stats[family.stat]);
    for (let tier = 1; tier <= reached; tier += 1) {
      const id = badgeId(family.id, tier);
      if (!owned.has(id)) ids.push(id);
    }
  }
  return ids;
}

/** Longest run of consecutive calendar days in `days` (`YYYY-MM-DD`). */
export function longestStreak(days: readonly string[]): number {
  const stamps = [
    ...new Set(
      days.flatMap((day) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
        const ms = Date.parse(`${day}T00:00:00Z`);
        return Number.isFinite(ms) ? [Math.round(ms / 86_400_000)] : [];
      }),
    ),
  ].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let index = 0; index < stamps.length; index += 1) {
    run = index > 0 && stamps[index]! - stamps[index - 1]! === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

export type BadgeTierView = {
  id: string;
  tier: number;
  target: number;
  goal: string;
  earnedAt: string | null;
};

export type BadgeFamilyView = {
  id: string;
  group: BadgeGroup;
  title: string;
  icon: string;
  color: string;
  value: number;
  /** Earned tiers, 0-4. */
  tier: number;
  tiers: BadgeTierView[];
};

/** A stored badge the learner has not seen yet. */
export type FreshBadge = {
  id: string;
  family: string;
  title: string;
  tier: number;
  icon: string;
  color: string;
  goal: string;
};

export type BadgeBoardView = {
  families: BadgeFamilyView[];
  earned: number;
  total: number;
  fresh: FreshBadge[];
};

export type StoredBadge = { id: string; earnedAt: string; seen: boolean };

export function freshBadge(id: string): FreshBadge | null {
  const parsed = parseBadgeId(id);
  if (!parsed) return null;
  const { family, tier } = parsed;
  return {
    id,
    family: family.id,
    title: family.title,
    tier,
    icon: family.icon,
    color: family.color,
    goal: family.goal(family.targets[tier - 1]!),
  };
}

export function buildBadgeBoard(stats: BadgeStats, stored: readonly StoredBadge[]): BadgeBoardView {
  const earnedAt = new Map(stored.map((badge) => [badge.id, badge.earnedAt]));
  const families = BADGE_FAMILIES.map((family): BadgeFamilyView => {
    const tiers = family.targets.map((target, index) => {
      const id = badgeId(family.id, index + 1);
      return { id, tier: index + 1, target, goal: family.goal(target), earnedAt: earnedAt.get(id) ?? null };
    });
    return {
      id: family.id,
      group: family.group,
      title: family.title,
      icon: family.icon,
      color: family.color,
      value: Math.max(0, Math.floor(stats[family.stat])),
      tier: tiers.filter((tier) => tier.earnedAt).length,
      tiers,
    };
  });
  const fresh = stored
    .filter((badge) => !badge.seen)
    .sort((a, b) => a.earnedAt.localeCompare(b.earnedAt) || a.id.localeCompare(b.id))
    .map((badge) => freshBadge(badge.id))
    .filter((badge): badge is FreshBadge => badge != null);
  return {
    families,
    earned: families.reduce((sum, family) => sum + family.tier, 0),
    total: BADGE_COUNT,
    fresh,
  };
}

function readFresh(value: unknown): FreshBadge[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) =>
      entry && typeof entry === "object" && typeof (entry as { id?: unknown }).id === "string"
        ? freshBadge((entry as { id: string }).id)
        : null,
    )
    .filter((badge): badge is FreshBadge => badge != null);
}

/** Reads a GET /api/badges body. Null when badges are not ready. */
export function readBadgeBoard(value: unknown): BadgeBoardView | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as { ready?: unknown; families?: unknown; earned?: unknown; total?: unknown; fresh?: unknown };
  if (raw.ready !== true || !Array.isArray(raw.families)) return null;
  const families = raw.families.filter(
    (family): family is BadgeFamilyView =>
      Boolean(family) &&
      typeof family.id === "string" &&
      typeof family.title === "string" &&
      typeof family.icon === "string" &&
      typeof family.color === "string" &&
      typeof family.value === "number" &&
      typeof family.tier === "number" &&
      Array.isArray(family.tiers) &&
      BADGE_GROUPS.some((group) => group.id === family.group),
  );
  if (families.length === 0) return null;
  return {
    families,
    earned: typeof raw.earned === "number" ? raw.earned : 0,
    total: typeof raw.total === "number" ? raw.total : BADGE_COUNT,
    fresh: readFresh(raw.fresh),
  };
}

/** Reads the unseen badges from a GET /api/badges?unseen=1 body. */
export function readFreshBadges(value: unknown): FreshBadge[] {
  if (!value || typeof value !== "object") return [];
  return readFresh((value as { fresh?: unknown }).fresh);
}
