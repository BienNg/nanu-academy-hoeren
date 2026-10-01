import assert from "node:assert/strict";
import test from "node:test";
import {
  checkNumberAnswer,
  livingAccessSlug,
  livingLessonKey,
  livingProgressKey,
  normalizeNumberAnswer,
  parseLivingFile,
  parseLivingLessonKey,
  parseLivingWorkplaces,
  parseReplies,
  workplaceFromAccessSlug,
} from "./living-content.js";

test("number answers compare equal across typing styles", () => {
  for (const typed of ["35,50", "35.50", "35,5", "35,50 €", "35.50€", " 35,50 Euro "]) {
    assert.ok(checkNumberAnswer(typed, "35,50"), typed);
  }
  for (const typed of ["15:30", "15.30", "15,30", "15:30 Uhr"]) {
    assert.ok(checkNumberAnswer(typed, "15:30"), typed);
  }
  assert.ok(checkNumberAnswer("9:30", "09:30"));
  assert.ok(checkNumberAnswer("35", "35,00"));
  assert.ok(checkNumberAnswer("35,00", "35"));
  assert.ok(checkNumberAnswer("0,50", "0,5"));
});

test("number answers reject wrong or empty input", () => {
  assert.equal(checkNumberAnswer("35,05", "35,50"), false);
  assert.equal(checkNumberAnswer("53,50", "35,50"), false);
  assert.equal(checkNumberAnswer("", "35,50"), false);
  assert.equal(checkNumberAnswer("fünfunddreißig", "35,50"), false);
  assert.equal(checkNumberAnswer("35,50", "keine Zahl"), false);
  assert.equal(normalizeNumberAnswer("abc"), null);
});

test("replies need exactly one correct answer and unique texts", () => {
  assert.equal(parseReplies([{ text: "Ja", correct: true }]), null);
  assert.equal(
    parseReplies([
      { text: "Ja", correct: true },
      { text: "Nein", correct: true },
    ]),
    null,
  );
  assert.equal(
    parseReplies([
      { text: "Ja", correct: true },
      { text: "ja", whyVi: "x" },
    ]),
    null,
  );
  const replies = parseReplies([
    { text: "Gerne.", correct: true },
    { text: "Was willst du?", whyVi: "Không lịch sự" },
  ]);
  assert.deepEqual(replies, [
    { text: "Gerne.", correct: true },
    { text: "Was willst du?", correct: false, whyVi: "Không lịch sự" },
  ]);
});

test("parseLivingFile keeps valid scenes and drops broken entries", () => {
  const file = parseLivingFile({
    scenes: [
      {
        id: "bezahlen",
        label: "Bezahlen",
        labelVi: "Thanh toán",
        clips: [
          { filename: "a.mp3", script: "Das macht zehn Euro.", answer: "10,00" },
          { filename: "b.mp3", script: "Karte?", replies: [{ text: "Ja", correct: true }] },
          { filename: "c.mp3", script: "die Feile", image: "../secret.webp" },
          { filename: "", script: "no file" },
          {
            filename: "d.mp3",
            script: "Beides",
            answer: "5",
            replies: [
              { text: "A", correct: true },
              { text: "B" },
            ],
          },
        ],
      },
      { id: "Bad Id", label: "x", clips: [] },
      { id: "bezahlen", label: "duplicate", clips: [] },
    ],
  });
  assert.ok(file);
  assert.equal(file.scenes.length, 1);
  const clips = file.scenes[0]?.clips ?? [];
  assert.equal(clips.length, 4);
  assert.equal(clips[0]?.answer, "10,00");
  assert.equal(clips[1]?.replies, undefined, "a single reply is not a choice");
  assert.equal(clips[2]?.image, undefined, "image paths cannot leave the workplace folder");
  assert.equal(clips[3]?.answer, "5");
  assert.equal(clips[3]?.replies, undefined, "one card type per clip");
  assert.equal(parseLivingFile({ clips: [] }), null);
});

test("workplace catalog needs slug and label", () => {
  const workplaces = parseLivingWorkplaces([
    { id: "nagelstudio", label: "Nagelstudio", slug: "nagelstudio", icon: "back_hand" },
    { label: "No slug" },
    { label: "Nagelstudio again", slug: "nagelstudio" },
  ]);
  assert.deepEqual(workplaces, [
    { id: "nagelstudio", label: "Nagelstudio", slug: "nagelstudio", icon: "back_hand" },
  ]);
});

test("keys and access slugs round-trip", () => {
  assert.equal(livingAccessSlug("nagelstudio"), "living-nagelstudio");
  assert.equal(workplaceFromAccessSlug("living-nagelstudio"), "nagelstudio");
  assert.equal(workplaceFromAccessSlug("a1-1"), null);
  assert.equal(workplaceFromAccessSlug("interview"), null);
  const lessonKey = livingLessonKey("nagelstudio", "bezahlen");
  assert.equal(lessonKey, "living-nagelstudio/bezahlen");
  assert.match(lessonKey, /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.deepEqual(parseLivingLessonKey(lessonKey), {
    workplaceSlug: "nagelstudio",
    sceneId: "bezahlen",
  });
  assert.equal(parseLivingLessonKey("a1-1/lektion-1"), null);
  assert.equal(livingProgressKey("nagelstudio", "bezahlen"), "living-nagelstudio-bezahlen");
});
