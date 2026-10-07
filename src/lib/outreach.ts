/**
 * Support outreach: the four groups already come from usage. This module
 * personalizes the approved Vietnamese messages and tracks the conversation.
 * Nothing here sends a message.
 */

export const OUTREACH_GROUPS = ["preaccess", "never", "light", "heavy"] as const;

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

export const OUTREACH_CHANNELS = ["zalo", "facebook", "email", "other"] as const;

export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

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

export const OUTREACH_GROUP_LABEL: Record<OutreachGroup, string> = {
  heavy: "Dùng nhiều",
  light: "Dùng ít",
  never: "Đã đăng ký, chưa làm gì",
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

export const OUTREACH_CHANNEL_LABEL: Record<OutreachChannel, string> = {
  zalo: "Zalo",
  facebook: "Facebook",
  email: "Email",
  other: "Khác",
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
  channel: OutreachChannel | null;
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
  channel: OutreachChannel | null;
  followUp: boolean;
  followUpOn: string | null;
  reason: OutreachReason | null;
  feedback: string;
  featureRequest: string;
  notes: string;
  /** Group used for this save, after the override. Blocks tin 2 for pre-access. */
  category: OutreachGroup;
  /** Set when support marks a message sent. Requires a channel. */
  markSent: 1 | 2 | null;
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

export function isOutreachChannel(value: string): value is OutreachChannel {
  return (OUTREACH_CHANNELS as readonly string[]).includes(value);
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

export function outreachMessage1(group: OutreachGroup, greetingName: string): string {
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
export function outreachMessage2(group: OutreachGroup): OutreachFollowUp {
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
    channel: null,
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
  if (patch.markSent === 2 && patch.category === "preaccess") {
    return { ok: false, error: "Nhóm chưa đăng ký chỉ có một tin." };
  }
  if (patch.markSent != null && !patch.channel) {
    return { ok: false, error: "Chọn kênh trước khi đánh dấu đã gửi." };
  }
  if (patch.markSent === 2 && STATUS_RANK[atLeast(base.status, patch.status)] < STATUS_RANK.da_gui_tin_1) {
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
      channel: patch.channel,
      sentAt,
      ownerUserId: claim ? actor.userId : base.ownerUserId,
      ownerName: claim ? clampText(actor.name ?? "", OUTREACH_NAME_MAX) || null : base.ownerName,
      followUp: patch.followUp,
      followUpOn: patch.followUpOn,
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

const REPLIED: ReadonlySet<OutreachStatus> = new Set(["da_tra_loi", "da_dung"]);

export type OutreachChannelStat = {
  channel: OutreachChannel;
  sent: number;
  replied: number;
};

export type OutreachWish = {
  id: string;
  name: string;
  email: string | null;
  category: OutreachGroup;
  text: string;
};

export function summarizeOutreach(rows: readonly OutreachRow[]): {
  reasons: { reason: OutreachReason; count: number }[];
  channels: OutreachChannelStat[];
  wishes: OutreachWish[];
} {
  const reasonCounts = new Map<OutreachReason, number>();
  for (const reason of OUTREACH_REASONS) reasonCounts.set(reason, 0);
  const channelCounts = new Map<OutreachChannel, OutreachChannelStat>();
  for (const channel of OUTREACH_CHANNELS) {
    channelCounts.set(channel, { channel, sent: 0, replied: 0 });
  }
  const wishes: OutreachWish[] = [];

  for (const row of rows) {
    const outreachCase = row.outreachCase;
    if (!outreachCase) continue;
    if (outreachCase.reason) {
      reasonCounts.set(outreachCase.reason, (reasonCounts.get(outreachCase.reason) ?? 0) + 1);
    }
    if (outreachCase.channel && outreachCase.status !== "chua_gui") {
      const stat = channelCounts.get(outreachCase.channel);
      if (stat) {
        stat.sent += 1;
        if (REPLIED.has(outreachCase.status)) stat.replied += 1;
      }
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
    channels: OUTREACH_CHANNELS.map((channel) => channelCounts.get(channel)!),
    wishes,
  };
}
