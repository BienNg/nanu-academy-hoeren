import assert from "node:assert/strict";
import test from "node:test";
import {
  APP_USE_REFRESH_MS,
  FRESH_SIGN_IN_MS,
  SIGN_IN_DEVICE_COOKIE,
  VISIT_IDLE_MS,
  STORAGE_KEY,
  bindStoredProgress,
  browserFromUserAgent,
  classifySignInDevice,
  clearStoredProgress,
  containsAccountStamps,
  levelAccessAfterPreUnlock,
  locationFromHeaders,
  nextAppUseLog,
  nextSignInLog,
  normalizeGrantEmail,
  normalizeProgress,
  progressStorageKey,
  readSignInRecords,
  shouldReplaceLocalWithCloud,
  signInContextFromHeaders,
  signInSummary,
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

test("a pre-unlock email is stored in lowercase", () => {
  assert.equal(normalizeGrantEmail("  Student@School.COM "), "student@school.com");
  assert.equal(normalizeGrantEmail("not-an-email"), null);
  assert.equal(normalizeGrantEmail(""), null);
});

test("a sign-in records device, browser, and city", () => {
  const now = Date.parse("2026-09-30T16:00:00.000Z");
  const headers = new Map<string, string>([
    ["user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1"],
    ["cookie", `${SIGN_IN_DEVICE_COOKIE}=mobile`],
    ["x-vercel-ip-city", "Ho%20Chi%20Minh%20City"],
    ["x-vercel-ip-country", "VN"],
  ]);
  const context = signInContextFromHeaders({
    get(name) {
      return headers.get(name) ?? null;
    },
  });
  assert.equal(context.device, "mobile");
  assert.equal(context.browser, "Safari");
  assert.equal(context.location, "Ho Chi Minh City, VN");

  const older = "2026-09-01T00:00:00.000Z";
  const records = readSignInRecords(
    nextSignInLog(
      [],
      {
        at: new Date(now).toISOString(),
        device: context.device,
        browser: context.browser,
        location: context.location,
      },
      now,
    ),
    [older],
    now,
  );
  assert.deepEqual(
    records.map((entry) => entry.at),
    [older, new Date(now).toISOString()],
  );
  assert.equal(signInSummary(records[0]), null);
  assert.equal(signInSummary(records[1]), "Mobile · Safari · Ho Chi Minh City, VN");
});

test("an app visit stays one row until they leave or switch device", () => {
  const start = Date.parse("2026-09-30T10:00:00.000Z");
  const use = {
    at: new Date(start).toISOString(),
    device: "mobile" as const,
    browser: "Safari",
    location: "Hanoi, VN",
  };
  const opened = nextAppUseLog([], use, start);
  assert.equal(opened.changed, true);
  assert.equal(opened.records.length, 1);

  const soon = start + 60_000;
  const stillHere = nextAppUseLog(
    opened.records,
    { ...use, at: new Date(soon).toISOString() },
    soon,
  );
  assert.equal(stillHere.changed, false);
  assert.equal(stillHere.records.length, 1);

  const refreshedAt = start + APP_USE_REFRESH_MS + 1000;
  const refreshed = nextAppUseLog(
    opened.records,
    { ...use, at: new Date(refreshedAt).toISOString() },
    refreshedAt,
  );
  assert.equal(refreshed.changed, true);
  assert.equal(refreshed.records.length, 1);
  assert.equal(refreshed.records[0]?.at, use.at);
  assert.equal(refreshed.records[0]?.seenAt, new Date(refreshedAt).toISOString());

  const returnedAt = refreshedAt + VISIT_IDLE_MS + 1000;
  const returned = nextAppUseLog(
    refreshed.records,
    { ...use, at: new Date(returnedAt).toISOString() },
    returnedAt,
  );
  assert.equal(returned.records.length, 2);

  const switched = nextAppUseLog(
    returned.records,
    { ...use, at: new Date(returnedAt + 1000).toISOString(), device: "desktop" },
    returnedAt + 1000,
  );
  assert.equal(switched.records.length, 3);
  assert.equal(switched.records[2]?.device, "desktop");
});

test("sign-in device treats an iPad desktop user agent as a tablet", () => {
  assert.equal(
    classifySignInDevice({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit Safari/605.1.15",
      maxTouchPoints: 5,
    }),
    "tablet",
  );
  assert.equal(
    classifySignInDevice({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit Safari/605.1.15",
      maxTouchPoints: 0,
    }),
    "desktop",
  );
  assert.equal(
    browserFromUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
    ),
    "Edge",
  );
  assert.equal(locationFromHeaders({ get: () => null }), null);
});

test("signing up claims a pre-unlock and an existing account keeps its courses", () => {
  assert.deepEqual(
    levelAccessAfterPreUnlock([], ["a1-1", "interview"], true),
    ["a1-1", "interview"],
  );
  assert.deepEqual(
    levelAccessAfterPreUnlock(["a2-1"], ["a1-1", "a2-1"], false),
    ["a2-1", "a1-1"],
  );
  assert.deepEqual(levelAccessAfterPreUnlock(["a1-1", "interview"], ["a1-1"], true), [
    "a1-1",
  ]);
});
