import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOutreachPatch,
  classifyOutreach,
  emptyOutreachCase,
  filterOutreachRows,
  joinOutreach,
  outreachConversionHint,
  outreachAnswerCompletesTin1,
  outreachAddress,
  outreachCatalog,
  outreachCatalogStart,
  outreachDayAfter,
  outreachDaysBetween,
  outreachDoneTodayJob,
  outreachHasFeedback,
  outreachJobFor,
  outreachJobWhy,
  outreachMatchesQuery,
  outreachMessage1,
  outreachMessage2,
  outreachObjectionReply,
  outreachOwnerMatches,
  outreachPrimarySend,
  outreachRelativeDay,
  outreachRequiredMessageId,
  summarizeOutreach,
  type OutreachCase,
  type OutreachContact,
  type OutreachPatch,
} from "./outreach.js";

const NOW = new Date("2026-10-08T04:00:00.000Z");
const ACTOR = { userId: "staff-1", name: "Lan" };

function contact(overrides: Partial<OutreachContact> = {}): OutreachContact {
  return {
    id: "user-1",
    email: "Ngoc@School.com",
    name: "Quế Ngọc",
    className: "G128",
    computedCategory: "light",
    parts: 1,
    hasAccount: true,
    activeSeconds: 1200,
    lastSeenAt: "2026-10-01T00:00:00.000Z",
    lastStudyOn: "2026-10-01",
    staff: false,
    ...overrides,
  };
}

function patch(overrides: Partial<OutreachPatch> = {}): OutreachPatch {
  return {
    email: "ngoc@school.com",
    greetingName: null,
    groupOverride: null,
    status: "chua_gui",
    followUp: false,
    followUpOn: null,
    reason: null,
    feedback: "",
    featureRequest: "",
    notes: "",
    category: "light",
    markSent: null,
    clearFollowUp: false,
    claim: false,
    hadAccount: true,
    parts: 1,
    ...overrides,
  };
}

test("messages use the address instead of the name", () => {
  assert.equal(outreachAddress(null), "em");
  assert.equal(outreachAddress("Ngọc"), "em");
  assert.equal(outreachAddress("chi"), "chị");
  const unsigned = outreachMessage1("preaccess", "anh") ?? "";
  assert.match(unsigned, /^Hallo/);
  assert.match(unsigned, /chưa thấy anh đăng ký/);
  assert.match(unsigned, /không anh nhé/);
  assert.doesNotMatch(unsigned, /(?<![\p{L}])em(?![\p{L}])/u);
  const heavy = outreachMessage1("heavy", "anh") ?? "";
  assert.match(heavy, /^Hallo/);
  assert.match(heavy, /Anh dùng app/);
  assert.match(heavy, /cảm ơn anh/);
  assert.match(heavy, /NaNu Go/);
  assert.doesNotMatch(heavy, /(?<![\p{L}])em(?![\p{L}])/u);
  const tech = outreachObjectionReply("tech", "cô");
  assert.equal(tech.kind, "message");
  if (tech.kind === "message") {
    assert.match(tech.text, /xem nha/);
    assert.match(tech.text, /Cô bị vướng/);
    assert.doesNotMatch(tech.text, /(?<![\p{L}])em(?![\p{L}])/u);
  }
});

test("group 4 has one message and a warning instead of tin 2", () => {
  assert.equal(outreachMessage2("preaccess").kind, "warning");
  assert.match(outreachMessage2("preaccess").text, /KHÔNG gửi link/);
  assert.equal(outreachMessage2("never").kind, "message");
  assert.equal(outreachObjectionReply("other").kind, "note");
  assert.equal(outreachObjectionReply("no_time").kind, "message");
});

test("marking tin 2 keeps a reply and blocks the unsigned group", () => {
  const sent = applyOutreachPatch(null, patch({ markSent: 1, status: "chua_gui" }), ACTOR, NOW);
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  assert.equal(sent.value.status, "da_gui_tin_1");
  assert.equal(sent.value.ownerUserId, null);
  assert.equal(sent.value.hadAccountAtContact, true);
  assert.equal(sent.value.partsAtContact, 1);

  const replied = applyOutreachPatch(
    sent.value,
    patch({ status: "da_tra_loi", reason: "no_time", feedback: "bận học", markSent: 2, parts: 4 }),
    ACTOR,
    NOW,
  );
  assert.equal(replied.ok, true);
  if (!replied.ok) return;
  assert.equal(replied.value.status, "da_tra_loi");
  assert.equal(replied.value.partsAtContact, 1);

  const blocked = applyOutreachPatch(
    sent.value,
    patch({ category: "preaccess", groupOverride: "preaccess", markSent: 2 }),
    ACTOR,
    NOW,
  );
  assert.equal(blocked.ok, false);
});

test("tin 2 waits until tin 1 exists", () => {
  const early = applyOutreachPatch(null, patch({ markSent: 2 }), ACTOR, NOW);
  assert.equal(early.ok, false);
});

test("queues, override, follow-up, and conversion use the case", () => {
  const base = emptyOutreachCase("ngoc@school.com");
  const waiting: OutreachCase = {
    ...base,
    status: "da_gui_tin_1",
    sentAt: "2026-10-01T00:00:00.000Z",
    ownerUserId: "staff-1",
    followUp: true,
    followUpOn: "2026-10-08",
    hadAccountAtContact: true,
    partsAtContact: 0,
    featureRequest: "thêm bài nghe ngắn",
    feedback: "app hay",
    updatedAt: "2026-10-07T00:00:00.000Z",
  };
  const rows = joinOutreach(
    [
      contact({ parts: 2 }),
      contact({
        id: "pending:new@school.com",
        email: "new@school.com",
        name: null,
        computedCategory: "preaccess",
        parts: null,
        hasAccount: false,
        activeSeconds: null,
      }),
    ],
    [{ ...waiting, groupOverride: "heavy" }, { ...emptyOutreachCase("new@school.com"), status: "da_gui_tin_1" }],
  );

  assert.equal(rows[0]?.category, "heavy");
  assert.equal(rows[0]?.conversionHint, true);
  assert.equal(
    outreachConversionHint(
      { hasAccount: true, parts: 2 },
      { ...waiting, status: "da_dung" },
    ),
    false,
  );

  const today = "2026-10-08";
  assert.equal(
    filterOutreachRows(rows, { category: "all", queue: "tin2", query: "", viewerId: "staff-1", today }).map(
      (row) => row.email,
    ).length,
    0,
  );
  assert.equal(outreachJobFor(rows[0]!, today), "tin1-heavy");
  assert.equal(
    filterOutreachRows(rows, { category: "all", queue: "mine", query: "", viewerId: "staff-2", today }).length,
    0,
  );
  assert.equal(
    filterOutreachRows(rows, { category: "all", queue: "wishes", query: "nghe", viewerId: "staff-1", today }).length,
    1,
  );
  const summary = summarizeOutreach(rows);
  assert.equal(summary.wishes[0]?.text, "thêm bài nghe ngắn");
  assert.equal(summary.feedbacks[0]?.text, "app hay");
  assert.equal(summary.feedbacks[0]?.name, "Quế Ngọc");
});

const TODAY = "2026-10-08";

test("a recent burst is dùng nhiều, a month of 1.5 hours is not", () => {
  assert.equal(
    classifyOutreach(
      {
        hasAccount: true,
        parts: 0,
        activeSeconds: 4 * 60 * 60,
        studyDays: [{ day: "2026-10-07", activeSeconds: 4 * 60 * 60 }],
        firstSeenOn: "2026-10-06",
      },
      TODAY,
    ),
    "heavy",
  );
  assert.equal(
    classifyOutreach(
      {
        hasAccount: true,
        parts: 1,
        activeSeconds: 90 * 60,
        studyDays: [{ day: "2026-09-20", activeSeconds: 90 * 60 }],
        firstSeenOn: "2026-09-10",
      },
      TODAY,
    ),
    "light",
  );
  assert.equal(
    classifyOutreach(
      {
        hasAccount: true,
        parts: 1,
        activeSeconds: 40 * 60,
        studyDays: [
          { day: "2026-10-01", activeSeconds: 10 * 60 },
          { day: "2026-10-03", activeSeconds: 15 * 60 },
          { day: "2026-10-06", activeSeconds: 15 * 60 },
        ],
        firstSeenOn: "2026-09-01",
      },
      TODAY,
    ),
    "light",
  );
  assert.equal(
    classifyOutreach(
      {
        hasAccount: true,
        parts: 0,
        activeSeconds: 60,
        studyDays: [],
        firstSeenOn: "2026-10-07",
      },
      TODAY,
    ),
    "fresh",
  );
  assert.equal(
    classifyOutreach(
      {
        hasAccount: true,
        parts: 0,
        activeSeconds: 60,
        studyDays: [],
        firstSeenOn: "2026-10-01",
      },
      TODAY,
    ),
    "never",
  );
});

test("a message sent before the reset goes back to tin 1", () => {
  const quiet = joinOutreach(
    [contact({ computedCategory: "heavy", lastStudyOn: "2026-09-20" })],
    [{ ...emptyOutreachCase("ngoc@school.com"), status: "da_gui_tin_2", sentAt: "2026-09-20T00:00:00.000Z" }],
  );
  assert.equal(outreachJobFor(quiet[0]!, TODAY), "tin1-heavy");

  const needsTin2 = joinOutreach(
    [contact({ computedCategory: "heavy", lastStudyOn: "2026-09-20" })],
    [{ ...emptyOutreachCase("ngoc@school.com"), status: "da_gui_tin_1", sentAt: "2026-09-20T00:00:00.000Z" }],
  );
  assert.equal(outreachJobFor(needsTin2[0]!, TODAY), "tin1-heavy");

  const fresh = joinOutreach(
    [contact({ computedCategory: "fresh", parts: 0, activeSeconds: 0, lastStudyOn: null })],
    [],
  );
  assert.equal(outreachJobFor(fresh[0]!, TODAY), null);
});

test("a send after the reset is not a new job", () => {
  const later = "2026-10-20";
  const sentAt = "2026-10-12T16:00:00.000Z";
  const sentTin1 = joinOutreach(
    [contact({ computedCategory: "heavy", lastStudyOn: "2026-09-20" })],
    [{ ...emptyOutreachCase("ngoc@school.com"), status: "da_gui_tin_1", sentAt }],
  );
  assert.equal(outreachJobFor(sentTin1[0]!, later), null);

  const sentTin2 = joinOutreach(
    [contact({ computedCategory: "heavy", lastStudyOn: "2026-09-20" })],
    [{ ...emptyOutreachCase("ngoc@school.com"), status: "da_gui_tin_2", sentAt }],
  );
  assert.equal(outreachJobFor(sentTin2[0]!, later), null);
});

test("the question catalog follows the group and opens on the current job", () => {
  const heavy = outreachCatalog("heavy", "chú");
  assert.match(heavy.find((item) => item.id === "open")?.message ?? "", /^Hallo/);
  assert.match(heavy.find((item) => item.id === "open")?.message ?? "", /Chú dùng app/);
  assert.ok(heavy.some((item) => item.category === "like"));
  assert.equal(heavy.find((item) => item.id === "fit-disappointed")?.message?.includes("rất tiếc"), true);
  assert.equal(heavy.some((item) => item.id === "wish-main"), false);
  assert.equal(heavy.some((item) => item.id === "checkin"), false);
  assert.equal(heavy.some((item) => item.category === "signup"), false);
  assert.equal(outreachCatalogStart("tin1-heavy", "heavy"), "open");

  const unsigned = outreachCatalog("preaccess", "em");
  assert.equal(unsigned.some((item) => item.id === "wish-main"), false);
  assert.equal(unsigned.some((item) => item.id === "fit-disappointed"), false);
  assert.ok(unsigned.some((item) => item.id === "fit-instead"));
  assert.ok(unsigned.some((item) => item.category === "signup"));
  assert.match(unsigned.find((item) => item.id === "signup-tech")?.reply ?? "", /Chụp màn hình/);

  assert.equal(outreachCatalog("fresh", "em").length, 0);
});

test("a saved follow-up date does not change the job", () => {
  assert.equal(outreachDaysBetween("2026-10-05", TODAY), 3);
  assert.equal(outreachDayAfter(TODAY, 7), "2026-10-15");
  assert.equal(outreachRelativeDay("2026-10-07", TODAY), "hôm qua");
  assert.equal(outreachRelativeDay("2026-10-10", TODAY), "còn 2 ngày");

  const [late] = joinOutreach(
    [contact()],
    [{ ...emptyOutreachCase("ngoc@school.com"), status: "da_gui_tin_1", followUp: true, followUpOn: "2026-10-06" }],
  );
  assert.equal(outreachJobFor(late!, TODAY), "tin1-light");
  assert.equal(outreachHasFeedback(late!), false);
  assert.deepEqual(outreachJobWhy(late!, "tin1-light", TODAY), { text: "Chưa có feedback", overdue: false });

  const [saved] = joinOutreach(
    [contact()],
    [{ ...emptyOutreachCase("ngoc@school.com"), feedback: "app hay" }],
  );
  assert.equal(outreachJobFor(saved!, TODAY), "tin1-light");
  assert.equal(outreachHasFeedback(saved!), true);
  assert.deepEqual(outreachJobWhy(saved!, "tin1-light", TODAY), { text: "Đã có feedback", overdue: false });

  assert.equal(outreachPrimarySend("tin1-preaccess", "chua_gui", "preaccess"), 1);
  assert.equal(outreachAnswerCompletesTin1("tin1-light", "chua_gui", "light", "app hơi khó", ""), true);
  assert.equal(outreachAnswerCompletesTin1("tin1-heavy", "chua_gui", "heavy", "  ", "thêm bài ngắn"), true);
  assert.equal(outreachAnswerCompletesTin1("tin1-never", "chua_gui", "never", "", ""), false);
  assert.equal(outreachAnswerCompletesTin1("tin1-light", "da_gui_tin_1", "light", "đã nói", ""), false);
  assert.equal(outreachPrimarySend(null, "chua_gui", "light"), null);
  assert.equal(outreachRequiredMessageId("tin1-light", "chua_gui", "light"), "open");
  assert.equal(outreachRequiredMessageId(null, "da_gui_tin_1", "heavy"), null);
});

test("sends today count toward the job they cleared, and owners filter", () => {
  const rows = joinOutreach(
    [contact(), contact({ id: "user-2", email: "an@school.com", computedCategory: "heavy" })],
    [
      { ...emptyOutreachCase("ngoc@school.com"), status: "da_gui_tin_1", sentAt: NOW.toISOString(), ownerUserId: "staff-1", ownerName: "Lan" },
      { ...emptyOutreachCase("an@school.com"), status: "da_gui_tin_2", sentAt: "2026-10-01T04:00:00.000Z" },
    ],
  );
  assert.equal(outreachDoneTodayJob(rows[0]!, TODAY), "tin1-light");
  assert.equal(outreachDoneTodayJob(rows[1]!, TODAY), null);
  assert.equal(outreachOwnerMatches(rows[0]!, "mine", "staff-1"), true);
  assert.equal(outreachOwnerMatches(rows[1]!, "unowned", "staff-1"), true);
  assert.equal(outreachMatchesQuery(rows[0]!, "lan"), true);

  const summary = summarizeOutreach(rows);
  assert.deepEqual(summary.owners, [{ name: "Lan", count: 1 }]);
  assert.equal(summary.statuses.find((item) => item.status === "da_gui_tin_2")?.count, 0);
  assert.equal(summary.statuses.find((item) => item.status === "chua_gui")?.count, 2);
});
