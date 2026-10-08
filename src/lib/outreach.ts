/**
 * Support outreach: groups come from recent study. This module personalizes
 * the approved Vietnamese messages and picks the one job support should do
 * next. Nothing here sends a message.
 */

import { dayKey } from "./xp";

export const OUTREACH_GROUPS = ["preaccess", "fresh", "never", "light", "heavy"] as const;

export type OutreachGroup = (typeof OUTREACH_GROUPS)[number];

export const OUTREACH_STATUSES = [
  "chua_gui",
  "da_gui_tin_1",
  "da_gui_tin_2",
  "da_tra_loi",
  "khong_tra_loi",
  "da_dung",
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];

export const OUTREACH_REASONS = [
  "no_time",
  "tech",
  "no_need",
  "forgot",
  "other_method",
  "no_motivation",
  "other",
] as const;

export type OutreachReason = (typeof OUTREACH_REASONS)[number];

export const OUTREACH_QUEUES = ["all", "tin1", "tin2", "followup", "mine", "wishes"] as const;

export type OutreachQueue = (typeof OUTREACH_QUEUES)[number];

export const OUTREACH_TEXT_MAX = 4000;
export const OUTREACH_NAME_MAX = 80;

/** Under this many days since the first sign-in, and not already Dùng nhiều. */
export const OUTREACH_FRESH_DAYS = 3;
/** Last study this many days ago, or older, counts as quiet. */
export const OUTREACH_QUIET_DAYS = 7;
/** Study days counted toward Dùng nhiều. */
export const OUTREACH_HABIT_DAYS = 28;
export const OUTREACH_HABIT_STUDY_DAYS = 3;
/** A burst of active time inside this window also counts as Dùng nhiều. */
export const OUTREACH_BURST_DAYS = 7;
export const OUTREACH_HEAVY_SECONDS = 90 * 60;
/** Below this, with no finished part, they have not tried the app. */
export const OUTREACH_TRIED_SECONDS = 5 * 60;

export const OUTREACH_GROUP_LABEL: Record<OutreachGroup, string> = {
  heavy: "Dùng nhiều",
  light: "Dùng ít",
  never: "Đã đăng ký, chưa làm gì",
  fresh: "Mới",
  preaccess: "Chưa đăng ký",
};

export const OUTREACH_STATUS_LABEL: Record<OutreachStatus, string> = {
  chua_gui: "Chưa gửi",
  da_gui_tin_1: "Đã gửi tin 1",
  da_gui_tin_2: "Đã gửi tin 2",
  da_tra_loi: "Đã trả lời",
  khong_tra_loi: "Không trả lời",
  da_dung: "Đã đăng ký / đã dùng sau khi nhắn",
};

export const OUTREACH_REASON_LABEL: Record<OutreachReason, string> = {
  no_time: "Không có thời gian",
  tech: "Lỗi đăng ký / kỹ thuật",
  no_need: "Không cần / không hiệu quả",
  forgot: "Quên / không biết",
  other_method: "Học cách khác",
  no_motivation: "Thiếu động lực",
  other: "Lý do khác",
};

export const OUTREACH_QUEUE_LABEL: Record<OutreachQueue, string> = {
  all: "Tất cả",
  tin1: "Cần tin 1",
  tin2: "Cần tin 2",
  followup: "Follow-up hôm nay",
  mine: "Của tôi",
  wishes: "Yêu cầu tính năng",
};

const STATUS_RANK: Record<OutreachStatus, number> = {
  chua_gui: 0,
  da_gui_tin_1: 1,
  da_gui_tin_2: 2,
  khong_tra_loi: 3,
  da_tra_loi: 3,
  da_dung: 4,
};

export type OutreachCase = {
  email: string;
  greetingName: string | null;
  groupOverride: OutreachGroup | null;
  status: OutreachStatus;
  sentAt: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  followUp: boolean;
  followUpOn: string | null;
  reason: OutreachReason | null;
  feedback: string;
  featureRequest: string;
  notes: string;
  hadAccountAtContact: boolean | null;
  partsAtContact: number | null;
  updatedAt: string | null;
};

export type OutreachContact = {
  id: string;
  email: string | null;
  name: string | null;
  className: string | null;
  computedCategory: OutreachGroup;
  parts: number | null;
  hasAccount: boolean;
  activeSeconds: number | null;
  lastSeenAt: string | null;
  /** Latest Vietnam day with active time, or null when they have not studied. */
  lastStudyOn: string | null;
  staff: boolean;
};

export type OutreachRow = OutreachContact & {
  category: OutreachGroup;
  outreachCase: OutreachCase | null;
  status: OutreachStatus;
  conversionHint: boolean;
};

export type OutreachActor = {
  userId: string;
  name: string | null;
};

export type OutreachPatch = {
  email: string;
  greetingName: string | null;
  groupOverride: OutreachGroup | null;
  status: OutreachStatus;
  followUp: boolean;
  followUpOn: string | null;
  reason: OutreachReason | null;
  feedback: string;
  featureRequest: string;
  notes: string;
  /** Group used for this save, after the override. Blocks tin 2 for pre-access. */
  category: OutreachGroup;
  /**
   * 1 or 2 advances the script status. "checkin" only stamps the send time,
   * for the quiet-week message and a finished follow-up.
   */
  markSent: 1 | 2 | "checkin" | null;
  /** Drop the follow-up flag when this send clears that job. */
  clearFollowUp: boolean;
  claim: boolean;
  hadAccount: boolean;
  parts: number | null;
};

export function isOutreachGroup(value: string): value is OutreachGroup {
  return (OUTREACH_GROUPS as readonly string[]).includes(value);
}

export function isOutreachStatus(value: string): value is OutreachStatus {
  return (OUTREACH_STATUSES as readonly string[]).includes(value);
}

export function isOutreachReason(value: string): value is OutreachReason {
  return (OUTREACH_REASONS as readonly string[]).includes(value);
}

/** Name inserted into the greeting. An empty name becomes "em". */
export function outreachGreetingName(
  accountName: string | null | undefined,
  greetingName: string | null | undefined,
): string {
  const custom = greetingName?.trim();
  if (custom) return custom;
  const account = accountName?.trim();
  if (account) return account;
  return "em";
}

export function outreachMessage1(group: OutreachGroup, greetingName: string): string | null {
  if (group === "fresh") return null;
  const name = greetingName.trim() || "em";
  if (group === "heavy") {
    return `Ê ${name} ơi! 😊 Mình thấy dạo này em học trên app NaNu Academy nhiều ghê, vui quá trời! Em thấy app sao rồi? Có gì thích, hay có gì thấy bất tiện không? Cứ nói thoải mái nha, mình nghe hết 🙌`;
  }
  if (group === "light") {
    return `Ê ${name} ơi! 😊 Mình thấy em có thử app NaNu Academy, cảm ơn em nha! Hỏi thiệt nè: em thấy sao? Có chỗ nào khó hiểu, chán, hay không giống em nghĩ không? Cứ nói thẳng với mình nha, mình không giận đâu 😄`;
  }
  if (group === "never") {
    return `Ê ${name} ơi! 😊 Mình thấy em đã đăng ký app NaNu Academy nhưng chưa vô xem thử. Không sao hết nha! Em có bị vướng chỗ nào không, kiểu đăng nhập hay không biết bắt đầu từ đâu? Nói mình biết, mình giúp liền 😊`;
  }
  return `Ê ${name} ơi! 😊 Lớp mình đa số đăng ký app rồi, mà em thì chưa. Mình tò mò thôi: em có lý do gì không? Bận, bị vướng chỗ nào, hay thấy chưa cần? Em cứ nói thật nha, giúp tụi mình nhiều lắm 🙏`;
}

export type OutreachFollowUp =
  | { kind: "message"; text: string }
  | { kind: "warning"; text: string };

/** Tin nhắn 2, or the warning for students who have not signed up. */
/** Quiet-week check-in. One script for anyone who already finished tin 2. */
export function outreachCheckIn(greetingName: string): string {
  const name = greetingName.trim() || "em";
  return `Ê ${name} ơi! 😊 Tuần này mình chưa thấy em vào app NaNu Academy. Mọi thứ ổn không? Em bận hay có gì vướng thì nói mình nha.`;
}

export function outreachMessage2(group: OutreachGroup): OutreachFollowUp {
  if (group === "fresh") {
    return {
      kind: "warning",
      text: "Nhóm Mới chưa nhắn. Chờ đủ 3 ngày, trừ khi em ấy đã học nhiều.",
    };
  }
  if (group === "preaccess") {
    return {
      kind: "warning",
      text: "⚠️ Nhóm này chỉ có 1 tin. KHÔNG gửi link trong tin đầu. Chỉ gửi link khi em ấy trả lời tích cực hoặc nhờ giúp đăng ký.",
    };
  }
  if (group === "heavy") {
    return {
      kind: "message",
      text: "À mà tụi mình vẫn đang làm app tiếp nè, nên em muốn app có thêm gì cứ nói mình nha! Lớn hay nhỏ đều được, tính năng, kiểu bài học, gì giúp em học tiếng Đức dễ hơn là mình thêm 💪",
    };
  }
  if (group === "light") {
    return {
      kind: "message",
      text: "Tụi mình vẫn đang làm app tiếp nè, nên có gì giúp em muốn vô học nhiều hơn là nói mình nha! Nhỏ xíu cũng được. Tụi mình muốn làm đúng cái em cần 💪",
    };
  }
  return {
    kind: "message",
    text: "Còn nếu em muốn app có thêm gì thì cũng nói mình nha, tụi mình đang làm tiếp nè 😊",
  };
}

export type OutreachObjectionReply =
  | { kind: "message"; text: string }
  | { kind: "note"; text: string };

/** Ready-made reply, or a note to support when there is no template. */
export function outreachObjectionReply(reason: OutreachReason): OutreachObjectionReply {
  if (reason === "no_time") {
    return {
      kind: "message",
      text: "Mình hiểu, ai cũng bận hết. Nhưng chính vì vậy mới có app nè: để em học xen kẽ lúc rảnh, chờ xe hay nghỉ giữa giờ cũng được. Mỗi ngày vài phút thôi cũng đủ giúp em ôn lại bài trên lớp, không bị quên. Em thử vài phút/ngày xem sao nha 😊",
    };
  }
  if (reason === "tech") {
    return {
      kind: "message",
      text: "Ồ vậy hả, cảm ơn em đã nói! Em bị vướng đoạn nào, đăng nhập hay không vào được? Chụp màn hình gửi mình xem nha, mình giúp em liền 💪",
    };
  }
  if (reason === "no_need") {
    return {
      kind: "message",
      text: "Ok em, cảm ơn em nói thật nha. Em đang ôn bài bằng cách nào rồi? Mình hỏi để xem app có thể bổ sung gì cho em không. App chỉ là phần thêm để luyện nghe và từ vựng nhanh hơn thôi, không bắt buộc đâu 😊",
    };
  }
  if (reason === "forgot") {
    return {
      kind: "message",
      text: "Không sao nha, ai cũng có lúc quên mà 😄 Em vô thử khoảng 5 phút thôi, xem có hợp không. Có gì khó mình hỗ trợ em nè!",
    };
  }
  if (reason === "other_method") {
    return {
      kind: "message",
      text: "Tốt quá, em có cách học riêng là hay rồi! App không thay thế mấy cách đó đâu, chỉ là thêm một chỗ để em luyện nghe và ôn từ vựng nhanh, đúng với bài đang học trên lớp. Dùng kèm thì càng nhớ lâu hơn 🙌",
    };
  }
  if (reason === "no_motivation") {
    return {
      kind: "message",
      text: "Hiểu em mà, có lúc ai cũng vậy 😅 Hay là em đặt mục tiêu nhỏ thôi: 5 phút/ngày, vài ngày đầu thôi. Nhỏ vậy dễ giữ thói quen hơn nhiều. Em thấy sao?",
    };
  }
  return {
    kind: "note",
    text: "Chưa có mẫu. Hỏi thêm em ấy rồi ghi vào Feedback chung.",
  };
}

export function emptyOutreachCase(email: string): OutreachCase {
  return {
    email,
    greetingName: null,
    groupOverride: null,
    status: "chua_gui",
    sentAt: null,
    ownerUserId: null,
    ownerName: null,
    followUp: false,
    followUpOn: null,
    reason: null,
    feedback: "",
    featureRequest: "",
    notes: "",
    hadAccountAtContact: null,
    partsAtContact: null,
    updatedAt: null,
  };
}

function clampText(value: string, max: number): string {
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function atLeast(status: OutreachStatus, floor: OutreachStatus): OutreachStatus {
  return STATUS_RANK[status] >= STATUS_RANK[floor] ? status : floor;
}

/**
 * Apply a support edit. A later status is kept when a message is marked sent,
 * so recording a reply is not wiped by tin 2. The usage snapshot is taken the
 * first time the student is contacted.
 */
export function applyOutreachPatch(
  existing: OutreachCase | null,
  patch: OutreachPatch,
  actor: OutreachActor,
  now: Date,
): { ok: true; value: OutreachCase } | { ok: false; error: string } {
  const email = patch.email.trim().toLowerCase();
  if (!email) return { ok: false, error: "This student has no email." };

  const base = existing ?? emptyOutreachCase(email);
  if (patch.markSent === 2 && (patch.category === "preaccess" || patch.category === "fresh")) {
    return { ok: false, error: "Nhóm này không có tin 2." };
  }
  if (patch.markSent === 2 && STATUS_RANK[atLeast(base.status, patch.status)] < STATUS_RANK.da_gui_tin_1) {
    return { ok: false, error: "Gửi tin 1 trước." };
  }
  if (patch.markSent === "checkin" && STATUS_RANK[atLeast(base.status, patch.status)] < STATUS_RANK.da_gui_tin_1) {
    return { ok: false, error: "Gửi tin 1 trước." };
  }
  if (patch.followUpOn && !isDay(patch.followUpOn)) {
    return { ok: false, error: "Ngày follow-up không hợp lệ." };
  }

  let status = patch.status;
  if (patch.markSent === 1) status = atLeast(status, "da_gui_tin_1");
  if (patch.markSent === 2) status = atLeast(status, "da_gui_tin_2");

  const contacting = patch.markSent != null || status !== "chua_gui";
  const snapshotMissing = base.hadAccountAtContact == null;
  const claim = patch.claim || patch.markSent != null;
  const sentAt =
    patch.markSent != null
      ? now.toISOString()
      : status !== "chua_gui" && !base.sentAt
        ? now.toISOString()
        : base.sentAt;

  return {
    ok: true,
    value: {
      email,
      greetingName: patch.greetingName ? clampText(patch.greetingName, OUTREACH_NAME_MAX) : null,
      groupOverride: patch.groupOverride,
      status,
      sentAt,
      ownerUserId: claim ? actor.userId : base.ownerUserId,
      ownerName: claim ? clampText(actor.name ?? "", OUTREACH_NAME_MAX) || null : base.ownerName,
      followUp: patch.clearFollowUp ? false : patch.followUp,
      followUpOn: patch.clearFollowUp ? null : patch.followUpOn,
      reason: patch.reason,
      feedback: clampText(patch.feedback, OUTREACH_TEXT_MAX),
      featureRequest: clampText(patch.featureRequest, OUTREACH_TEXT_MAX),
      notes: clampText(patch.notes, OUTREACH_TEXT_MAX),
      hadAccountAtContact:
        contacting && snapshotMissing ? patch.hadAccount : base.hadAccountAtContact,
      partsAtContact: contacting && snapshotMissing ? patch.parts : base.partsAtContact,
      updatedAt: now.toISOString(),
    },
  };
}

/** True when usage after the first contact shows they signed up or finished a part. */
export function outreachConversionHint(
  contact: Pick<OutreachContact, "hasAccount" | "parts">,
  outreachCase: OutreachCase | null,
): boolean {
  if (!outreachCase?.sentAt) return false;
  if (outreachCase.status === "da_dung") return false;
  if (outreachCase.hadAccountAtContact === false && contact.hasAccount) return true;
  const partsThen = outreachCase.partsAtContact;
  const partsNow = contact.parts ?? 0;
  if ((partsThen === 0 || partsThen == null) && contact.hasAccount && partsNow > 0) {
    if (outreachCase.hadAccountAtContact === false) return true;
    if (partsThen === 0) return true;
  }
  return false;
}

export function effectiveOutreachGroup(
  computed: OutreachGroup,
  outreachCase: OutreachCase | null,
): OutreachGroup {
  return outreachCase?.groupOverride ?? computed;
}

export function joinOutreach(
  contacts: readonly OutreachContact[],
  cases: readonly OutreachCase[],
): OutreachRow[] {
  const byEmail = new Map<string, OutreachCase>();
  for (const outreachCase of cases) byEmail.set(outreachCase.email, outreachCase);
  return contacts.map((contact) => {
    const email = contact.email?.trim().toLowerCase() ?? "";
    const outreachCase = email ? (byEmail.get(email) ?? null) : null;
    return {
      ...contact,
      category: effectiveOutreachGroup(contact.computedCategory, outreachCase),
      outreachCase,
      status: outreachCase?.status ?? "chua_gui",
      conversionHint: outreachConversionHint(contact, outreachCase),
    };
  });
}

export function outreachNeedsTin2(row: OutreachRow): boolean {
  return row.status === "da_gui_tin_1" && row.category !== "preaccess";
}

export function outreachFollowUpDue(row: OutreachRow, today: string): boolean {
  const outreachCase = row.outreachCase;
  if (!outreachCase?.followUp || !outreachCase.followUpOn) return false;
  return outreachCase.followUpOn <= today;
}

export function filterOutreachRows(
  rows: readonly OutreachRow[],
  filter: {
    category: OutreachGroup | "all";
    queue: OutreachQueue;
    query: string;
    viewerId: string;
    today: string;
  },
): OutreachRow[] {
  const needle = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.category !== "all" && row.category !== filter.category) return false;
    if (filter.queue === "tin1" && row.status !== "chua_gui") return false;
    if (filter.queue === "tin2" && !outreachNeedsTin2(row)) return false;
    if (filter.queue === "followup" && !outreachFollowUpDue(row, filter.today)) return false;
    if (filter.queue === "mine" && row.outreachCase?.ownerUserId !== filter.viewerId) return false;
    if (filter.queue === "wishes" && !row.outreachCase?.featureRequest.trim()) return false;
    if (!needle) return true;
    const haystack = [
      row.name,
      row.email,
      row.className,
      row.outreachCase?.ownerName,
      row.outreachCase?.feedback,
      row.outreachCase?.featureRequest,
      row.outreachCase?.notes,
      OUTREACH_STATUS_LABEL[row.status],
      OUTREACH_GROUP_LABEL[row.category],
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export type OutreachWish = {
  id: string;
  name: string;
  email: string | null;
  category: OutreachGroup;
  text: string;
};

export function summarizeOutreach(rows: readonly OutreachRow[]): {
  reasons: { reason: OutreachReason; count: number }[];
  wishes: OutreachWish[];
} {
  const reasonCounts = new Map<OutreachReason, number>();
  for (const reason of OUTREACH_REASONS) reasonCounts.set(reason, 0);
  const wishes: OutreachWish[] = [];

  for (const row of rows) {
    const outreachCase = row.outreachCase;
    if (!outreachCase) continue;
    if (outreachCase.reason) {
      reasonCounts.set(outreachCase.reason, (reasonCounts.get(outreachCase.reason) ?? 0) + 1);
    }
    const wish = outreachCase.featureRequest.trim();
    if (wish) {
      wishes.push({
        id: row.id,
        name: row.name?.trim() || row.email || "Học viên",
        email: row.email,
        category: row.category,
        text: wish,
      });
    }
  }

  return {
    reasons: OUTREACH_REASONS.map((reason) => ({
      reason,
      count: reasonCounts.get(reason) ?? 0,
    })),
    wishes,
  };
}

export type OutreachActivityDay = {
  day: string;
  activeSeconds: number;
};

export type OutreachUsage = {
  hasAccount: boolean;
  parts: number;
  /** Active seconds still stored on the account. */
  activeSeconds: number;
  studyDays: readonly OutreachActivityDay[];
  /** Vietnam day of the first sign-in. Null when it is unknown. */
  firstSeenOn: string | null;
};

/** `YYYY-MM-DD`, `days` earlier. Date-only arithmetic, no timezone shift. */
export function outreachDayBefore(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, date));
  utc.setUTCDate(utc.getUTCDate() - days);
  const y = utc.getUTCFullYear();
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const d = String(utc.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function secondsInWindow(days: readonly OutreachActivityDay[], start: string, today: string): number {
  let seconds = 0;
  for (const day of days) {
    if (day.day >= start && day.day <= today) seconds += day.activeSeconds;
  }
  return seconds;
}

function studyDayCount(days: readonly OutreachActivityDay[], start: string, today: string): number {
  const seen = new Set<string>();
  for (const day of days) {
    if (day.activeSeconds > 0 && day.day >= start && day.day <= today) seen.add(day.day);
  }
  return seen.size;
}

/**
 * Group order: not signed up, then a recent burst or a habit, then too new
 * to judge, then signed up and idle, then everyone who tried the app.
 */
export function classifyOutreach(usage: OutreachUsage, today: string): OutreachGroup {
  if (!usage.hasAccount) return "preaccess";
  const habitStart = outreachDayBefore(today, OUTREACH_HABIT_DAYS - 1);
  const burstStart = outreachDayBefore(today, OUTREACH_BURST_DAYS - 1);
  const heavy =
    studyDayCount(usage.studyDays, habitStart, today) >= OUTREACH_HABIT_STUDY_DAYS ||
    secondsInWindow(usage.studyDays, burstStart, today) >= OUTREACH_HEAVY_SECONDS;
  if (heavy) return "heavy";
  const freshLine = outreachDayBefore(today, OUTREACH_FRESH_DAYS);
  if (usage.firstSeenOn != null && usage.firstSeenOn > freshLine) return "fresh";
  if (usage.parts === 0 && usage.activeSeconds < OUTREACH_TRIED_SECONDS) return "never";
  return "light";
}

export function latestStudyDay(days: readonly OutreachActivityDay[]): string | null {
  let latest: string | null = null;
  for (const day of days) {
    if (day.activeSeconds <= 0) continue;
    if (latest == null || day.day > latest) latest = day.day;
  }
  return latest;
}

export const OUTREACH_JOBS = [
  "followup",
  "quiet",
  "tin2",
  "tin1-heavy",
  "tin1-light",
  "tin1-never",
  "tin1-preaccess",
] as const;

export type OutreachJobId = (typeof OUTREACH_JOBS)[number];

export const OUTREACH_JOB_LABEL: Record<OutreachJobId, string> = {
  followup: "Follow-up đến hạn",
  quiet: "Im một tuần",
  tin2: "Tin 2",
  "tin1-heavy": "Tin 1 · Dùng nhiều",
  "tin1-light": "Tin 1 · Dùng ít",
  "tin1-never": "Tin 1 · Chưa làm gì",
  "tin1-preaccess": "Tin 1 · Chưa đăng ký",
};

export const OUTREACH_JOB_HINT: Record<OutreachJobId, string> = {
  followup: "Mỗi người một ghi chú. Mở hàng, nhắn, rồi đánh dấu.",
  quiet: "Một lời hỏi thăm. Chỉ người đã nhận tin 2 và im một tuần.",
  tin2: "Hỏi em muốn app có thêm gì. Làm hết nhóm này trước lời hỏi thăm.",
  "tin1-heavy": "Một mẫu cho cả nhóm. Lời chào đổi theo tên.",
  "tin1-light": "Một mẫu cho cả nhóm. Lời chào đổi theo tên.",
  "tin1-never": "Một mẫu cho cả nhóm. Lời chào đổi theo tên.",
  "tin1-preaccess": "Một mẫu. Không gửi link trong tin này.",
};

const TIN2_GROUPS: ReadonlySet<OutreachGroup> = new Set(["heavy", "light", "never"]);
const QUIET_GROUPS: ReadonlySet<OutreachGroup> = new Set(["heavy", "light"]);
const QUIET_STATUSES: ReadonlySet<OutreachStatus> = new Set([
  "da_gui_tin_2",
  "da_tra_loi",
  "khong_tra_loi",
]);

function sentOn(sentAt: string | null): string | null {
  if (!sentAt) return null;
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return null;
  return dayKey(date);
}

/**
 * The one job this person sits in. Follow-up wins. Tin 2 wins over the quiet
 * check-in. Mới is never a job.
 */
export function outreachJobFor(row: OutreachRow, today: string): OutreachJobId | null {
  const outreachCase = row.outreachCase;
  if (outreachCase?.followUp && outreachCase.followUpOn && outreachCase.followUpOn <= today) {
    return "followup";
  }
  if (row.status === "da_gui_tin_1" && TIN2_GROUPS.has(row.category)) return "tin2";
  const quietLine = outreachDayBefore(today, OUTREACH_QUIET_DAYS);
  const studiedRecently = row.lastStudyOn != null && row.lastStudyOn > quietLine;
  const messagedOn = sentOn(outreachCase?.sentAt ?? null);
  const messagedRecently = messagedOn != null && messagedOn > quietLine;
  if (
    QUIET_GROUPS.has(row.category) &&
    QUIET_STATUSES.has(row.status) &&
    !studiedRecently &&
    !messagedRecently
  ) {
    return "quiet";
  }
  if (row.status !== "chua_gui") return null;
  if (row.category === "heavy") return "tin1-heavy";
  if (row.category === "light") return "tin1-light";
  if (row.category === "never") return "tin1-never";
  if (row.category === "preaccess") return "tin1-preaccess";
  return null;
}

export function outreachJobWhy(row: OutreachRow, job: OutreachJobId): string {
  if (job === "followup") return row.outreachCase?.followUpOn ? `Hẹn ${row.outreachCase.followUpOn}` : "Đã hẹn";
  if (job === "quiet") return row.lastStudyOn ? `Học lần cuối ${row.lastStudyOn}` : "Chưa thấy học";
  if (job === "tin2") return "Đã gửi tin 1";
  return "Chưa gửi";
}
