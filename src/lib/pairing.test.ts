import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPairingSet,
  checkPairing,
  isPairingItemEligible,
  MAX_PAIRING_WORDS,
  PAIRING_SET_SIZE,
} from "./pairing.js";

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const lektion = [
  { id: "c1", script: "Hallo", translationVi: "Xin chào" },
  { id: "c2", script: "Deutsch", translationVi: "tiếng Đức" },
  { id: "c3", script: "Guten Morgen", translationVi: "Chào buổi sáng" },
  { id: "c4", script: "Danke", translationVi: "Cảm ơn" },
  { id: "c5", script: "Tschüss", translationVi: "Tạm biệt" },
  { id: "c6", script: "Ich komme aus Vietnam und wohne in Berlin.", translationVi: "Tôi đến từ Việt Nam." },
  { id: "c7", script: "Hallo", translationVi: "Xin chào lại" }, // duplicate script, should be deduped
];

test("eligibility needs a short script (<= MAX_PAIRING_WORDS) and a translation", () => {
  assert.equal(isPairingItemEligible({ script: "Hallo", translationVi: "Xin chào" }), true);
  assert.equal(isPairingItemEligible({ script: "Hallo", translationVi: "" }), false);
  assert.equal(
    isPairingItemEligible({ script: "Ich komme aus Vietnam und wohne in Berlin.", translationVi: "x" }),
    false,
  );
  const atLimit = Array.from({ length: MAX_PAIRING_WORDS }, () => "w").join(" ");
  const overLimit = `${atLimit} w`;
  assert.equal(isPairingItemEligible({ script: atLimit, translationVi: "x" }), true);
  assert.equal(isPairingItemEligible({ script: overLimit, translationVi: "x" }), false);
});

test("buildPairingSet returns exactly PAIRING_SET_SIZE deduped, eligible clips", () => {
  const set = buildPairingSet(lektion, [], new Set(), seeded(1));
  assert.equal(set?.length, PAIRING_SET_SIZE);
  const scripts = new Set(set?.map((clip) => clip.script.toLowerCase()));
  assert.equal(scripts.size, set?.length); // no duplicate scripts (c1/c7 collision resolved)
  for (const clip of set ?? []) {
    assert.equal(isPairingItemEligible(clip), true);
  }
});

test("buildPairingSet tops up from the level pool when the lektion is thin", () => {
  const thinLektion = lektion.slice(0, 2);
  const levelExtra = [
    { id: "l1", script: "Bitte", translationVi: "Xin mời" },
    { id: "l2", script: "Ja", translationVi: "Vâng" },
    { id: "l3", script: "Nein", translationVi: "Không" },
  ];
  const set = buildPairingSet(thinLektion, levelExtra, new Set(), seeded(2));
  assert.equal(set?.length, PAIRING_SET_SIZE);
});

test("buildPairingSet returns null when there still aren't enough eligible clips", () => {
  const set = buildPairingSet(lektion.slice(0, 2), [], new Set());
  assert.equal(set, null);
});

test("buildPairingSet excludes already-used clip ids", () => {
  const used = new Set(["c1", "c2", "c3"]);
  const set = buildPairingSet(lektion, [], used, seeded(3));
  assert.equal(set, null); // only c4, c5 left eligible after exclusion
});

test("checkPairing scores correct pairs by matching clip ids, partial credit for partial submission", () => {
  const items = [
    { id: "c1" },
    { id: "c2" },
    { id: "c3" },
    { id: "c4" },
    { id: "c5" },
  ];
  const result = checkPairing(items, [
    { viClipId: "c1", deClipId: "c1" }, // correct
    { viClipId: "c2", deClipId: "c3" }, // wrong
  ]);
  assert.equal(result.total, 5);
  assert.equal(result.correctCount, 1);
  assert.equal(result.accuracy, 20);
  assert.equal(result.pairs.length, 2);
});

test("checkPairing ignores pairs referencing ids outside the set", () => {
  const items = [{ id: "c1" }, { id: "c2" }];
  const result = checkPairing(items, [{ viClipId: "bogus", deClipId: "c1" }]);
  assert.equal(result.pairs.length, 0);
  assert.equal(result.correctCount, 0);
});
