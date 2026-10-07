import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOutreachPatch,
  emptyOutreachCase,
  filterOutreachRows,
  joinOutreach,
  outreachConversionHint,
  outreachGreetingName,
  outreachMessage1,
  outreachMessage2,
  outreachObjectionReply,
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
    channel: "zalo",
    followUp: false,
    followUpOn: null,
    reason: null,
    feedback: "",
    featureRequest: "",
    notes: "",
    category: "light",
    markSent: null,
    claim: false,
    hadAccount: true,
    parts: 1,
    ...overrides,
  };
}

test("greeting falls back to em and prefers the name support typed", () => {
  assert.equal(outreachGreetingName(null, null), "em");
  assert.equal(outreachGreetingName("  ", "  "), "em");
  assert.equal(outreachGreetingName("Ngọc", null), "Ngọc");
  assert.equal(outreachGreetingName("Ngọc", "em"), "em");
  assert.match(outreachMessage1("preaccess", "em"), /^Ê em ơi!/);
  assert.match(outreachMessage1("heavy", "Quế Ngọc"), /Ê Quế Ngọc ơi!/);
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
  assert.equal(sent.value.ownerUserId, "staff-1");
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
  const missingChannel = applyOutreachPatch(null, patch({ markSent: 1, channel: null }), ACTOR, NOW);
  assert.equal(missingChannel.ok, false);
});

test("queues, override, follow-up, and conversion use the case", () => {
  const base = emptyOutreachCase("ngoc@school.com");
  const waiting: OutreachCase = {
    ...base,
    status: "da_gui_tin_1",
    channel: "zalo",
    sentAt: "2026-10-01T00:00:00.000Z",
    ownerUserId: "staff-1",
    followUp: true,
    followUpOn: "2026-10-08",
    hadAccountAtContact: true,
    partsAtContact: 0,
    featureRequest: "thêm bài nghe ngắn",
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
    1,
  );
  assert.equal(
    filterOutreachRows(rows, { category: "all", queue: "followup", query: "", viewerId: "staff-1", today })[0]?.email,
    "Ngoc@School.com",
  );
  assert.equal(
    filterOutreachRows(rows, { category: "all", queue: "mine", query: "", viewerId: "staff-2", today }).length,
    0,
  );
  assert.equal(
    filterOutreachRows(rows, { category: "all", queue: "wishes", query: "nghe", viewerId: "staff-1", today }).length,
    1,
  );
  assert.equal(summarizeOutreach(rows).wishes[0]?.text, "thêm bài nghe ngắn");
  assert.equal(summarizeOutreach(rows).channels.find((item) => item.channel === "zalo")?.sent, 1);
});
