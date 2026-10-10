/**
 * The first-run tour of the level map. It shows once per learner: finishing it
 * stamps `user_progress.onboarding_completed_at`, and anyone with XP counts as
 * already onboarded. When something a step points at is missing, the tour does
 * not start, logs why on the visit, and tries again on the next map visit.
 */

/** Elements the tour points at, marked with `data-tour` on the map. */
export type OnboardingTarget = "course" | "video" | "study" | "practice" | "words" | "jump";

export type OnboardingStep = {
  target: OnboardingTarget;
  title: string;
  body: string;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    target: "course",
    title: "Khóa học của bạn",
    body: "Đây là khóa bạn đang học. Muốn đổi sang khóa khác thì bấm vào đây bất cứ lúc nào.",
  },
  {
    target: "video",
    title: "Video bài học",
    body: "Mỗi bài bắt đầu bằng video giải thích. Không muốn xem? Cứ bỏ qua và vào học ngay.",
  },
  {
    target: "study",
    title: "Học từ vựng",
    body: "Nghe từng câu của bài, xem lời và nghĩa tiếng Việt. Đây là bước học trước khi luyện tập.",
  },
  {
    target: "practice",
    title: "Luyện tập",
    body: "Luyện tập với những câu vừa học. Hoàn thành để nhận XP và mở bài tiếp theo.",
  },
  {
    target: "words",
    title: "Danh sách từ vựng",
    body: "Mỗi bài có danh sách từ ở góc trên bên phải. Bấm vào để xem và nghe lại từ của bài.",
  },
  {
    target: "jump",
    title: "Nhảy bài",
    body: "Đã biết bài này rồi? Làm một bài kiểm tra ngắn để nhảy thẳng tới bài tiếp theo.",
  },
];

/** Admin-facing reasons, read as "Onboarding skipped because …". */
export const ONBOARDING_SKIP_REASON = {
  noCourse: "no course is unlocked",
  noOpenLesson: "there is no open Lektion",
  course: "the course button is missing",
  video: "the first open Lektion has no video node",
  study: "the first open Lektion has no study node",
  practice: "the first open Lektion has no practice node",
  words: "the first open Lektion has no vocabulary list",
  jump: "there is no jump node",
} as const;

/**
 * Reasons the tour cannot run on this map, in step order. Empty means every
 * step has its target. Without an open Lektion the node reasons are folded
 * into that one.
 */
export function onboardingSkipReasons(
  found: Readonly<Record<OnboardingTarget, boolean>>,
  hasOpenLesson: boolean,
): string[] {
  const reasons: string[] = [];
  if (!found.course) reasons.push(ONBOARDING_SKIP_REASON.course);
  if (!hasOpenLesson) {
    reasons.push(ONBOARDING_SKIP_REASON.noOpenLesson);
  } else {
    if (!found.video) reasons.push(ONBOARDING_SKIP_REASON.video);
    if (!found.study) reasons.push(ONBOARDING_SKIP_REASON.study);
    if (!found.practice) reasons.push(ONBOARDING_SKIP_REASON.practice);
    if (!found.words) reasons.push(ONBOARDING_SKIP_REASON.words);
  }
  if (!found.jump) reasons.push(ONBOARDING_SKIP_REASON.jump);
  return reasons;
}

/** "Onboarding skipped because a and b", for the admin visit list. */
export function onboardingSkipLine(reasons: readonly string[]): string {
  if (reasons.length === 0) return "Onboarding skipped";
  const list =
    reasons.length === 1
      ? reasons[0]
      : `${reasons.slice(0, -1).join(", ")} and ${reasons[reasons.length - 1]}`;
  return `Onboarding skipped because ${list}`;
}

export type OnboardingRecord = {
  /** False when `onboarding_completed_at` could not be read, e.g. before the SQL ran. */
  readable: boolean;
  completedAt: string | null;
  /** An admin reset the tour. The learner sees it again whatever their XP. */
  resetAt: string | null;
  /** All-time XP, or null when it could not be read. */
  totalXp: number | null;
};

/** The vocabulary-list hint stays until this learner opens the list once. */
export function vocabListOpenedKey(userId: string): string {
  return `nanu-vocab-list-opened:${userId}`;
}

/**
 * One lesson carries the hint: the current open lesson that has a list, or
 * the first open lesson that has one.
 */
export function vocabHintLessonSlug(
  lessons: readonly { slug: string; hasList: boolean; current: boolean }[],
): string | null {
  const listed = lessons.filter((lesson) => lesson.hasList);
  return listed.find((lesson) => lesson.current)?.slug ?? listed[0]?.slug ?? null;
}

/**
 * "pending" shows the tour. "earned" means the learner has XP but no stamp yet,
 * so the caller stamps it. Anything unreadable stays "done": a tour that can
 * never be marked finished would come back on every visit.
 */
export function onboardingState(record: OnboardingRecord): "pending" | "done" | "earned" {
  if (!record.readable || record.completedAt) return "done";
  if (record.resetAt) return "pending";
  if (record.totalXp == null) return "done";
  return record.totalXp > 0 ? "earned" : "pending";
}
