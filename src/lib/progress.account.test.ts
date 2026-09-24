import assert from "node:assert/strict";
import test from "node:test";
import {
  FRESH_SIGN_IN_MS,
  STORAGE_KEY,
  bindStoredProgress,
  clearStoredProgress,
  containsAccountStamps,
  normalizeProgress,
  progressStorageKey,
  shouldReplaceLocalWithCloud,
  type StoredProgress,
} from "./progress.js";

const PREVIOUS_ACCOUNT = JSON.stringify({
  learn: {
    "lektion-3": {
      currentClipIndex: 2,
      completedClipIds: ["clip-a", "clip-b"],
      runCount: 1,
      runCompletedClipIds: ["clip-a"],
      reviewedClipIds: [],
      studyRunCount: 0,
      completedAt: "2026-09-23T07:10:31.305Z",
    },
  },
});

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear() {
      items.clear();
    },
    getItem(key: string) {
      return items.get(key) ?? null;
    },
    key(index: number) {
      return [...items.keys()][index] ?? null;
    },
    removeItem(key: string) {
      items.delete(key);
    },
    setItem(key: string, value: string) {
      items.set(key, value);
    },
  };
}

test("signing in does not inherit the previous account's shared progress", () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, PREVIOUS_ACCOUNT);
  storage.setItem("nanu-progress-restaurantfachkraft", JSON.stringify(["old-clip"]));

  const progress = bindStoredProgress(storage, "new-user");

  assert.equal(progress.learn["lektion-3"], undefined);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem("nanu-progress-restaurantfachkraft"), null);
  assert.equal(storage.getItem(progressStorageKey("new-user")), null);
});

test("signing in keeps progress already stored for that same user", () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, PREVIOUS_ACCOUNT);
  storage.setItem(progressStorageKey("returning-user"), PREVIOUS_ACCOUNT);

  const progress = bindStoredProgress(storage, "returning-user");

  assert.equal(progress.learn["lektion-3"]?.completedClipIds.length, 2);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(
    storage.getItem(progressStorageKey("returning-user")),
    PREVIOUS_ACCOUNT,
  );
});

test("another user's scoped progress stays unread", () => {
  const storage = memoryStorage();
  storage.setItem(progressStorageKey("user-a"), PREVIOUS_ACCOUNT);

  const progress = bindStoredProgress(storage, "user-b");

  assert.equal(progress.learn["lektion-3"], undefined);
  assert.equal(storage.getItem(progressStorageKey("user-a")), PREVIOUS_ACCOUNT);
});

test("logout clears every account cache on this device", () => {
  const storage = memoryStorage();
  storage.setItem(STORAGE_KEY, PREVIOUS_ACCOUNT);
  storage.setItem(progressStorageKey("user-a"), PREVIOUS_ACCOUNT);
  storage.setItem(progressStorageKey("user-b"), PREVIOUS_ACCOUNT);
  storage.setItem("nanu-progress-restaurantfachkraft", "[]");
  storage.setItem("unrelated", "keep");

  clearStoredProgress(storage);

  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem(progressStorageKey("user-a")), null);
  assert.equal(storage.getItem(progressStorageKey("user-b")), null);
  assert.equal(storage.getItem("nanu-progress-restaurantfachkraft"), null);
  assert.equal(storage.getItem("unrelated"), "keep");
});

test("a fresh sign-in replaces device progress with the cloud document", () => {
  const now = Date.parse("2026-09-24T04:00:00.000Z");
  assert.equal(shouldReplaceLocalWithCloud(undefined, now), true);
  assert.equal(
    shouldReplaceLocalWithCloud(Math.floor((now - 30_000) / 1000), now),
    true,
  );
  assert.equal(
    shouldReplaceLocalWithCloud(
      Math.floor((now - FRESH_SIGN_IN_MS) / 1000),
      now,
    ),
    false,
  );
});

test("a copied account is still detected after one extra answer", () => {
  const previous = normalizeProgress(JSON.parse(PREVIOUS_ACCOUNT) as StoredProgress);
  const copied = normalizeProgress(structuredClone(previous));
  const withOneMoreAnswer = normalizeProgress({
    learn: {
      ...copied.learn,
      "lektion-3": {
        ...copied.learn["lektion-3"],
        completedClipIds: [
          ...(copied.learn["lektion-3"]?.completedClipIds ?? []),
          "clip-c",
        ],
      },
    },
  });
  const ownWork = normalizeProgress({
    learn: {
      "lektion-3": {
        currentClipIndex: 1,
        completedClipIds: ["clip-c"],
        runCount: 1,
        runCompletedClipIds: ["clip-c"],
        reviewedClipIds: [],
        studyRunCount: 0,
        completedAt: "2026-09-24T04:31:15.541Z",
      },
    },
  });

  assert.equal(containsAccountStamps(copied, previous), true);
  assert.equal(containsAccountStamps(withOneMoreAnswer, previous), true);
  assert.equal(containsAccountStamps(ownWork, previous), false);
  assert.equal(containsAccountStamps(normalizeProgress({}), previous), false);
});
