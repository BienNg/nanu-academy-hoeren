import { unstable_cache } from "next/cache";
import { listAdminDuels } from "@/lib/duel-store";
import {
  listAdminListeningRuns,
  listAllUserProgress,
  type AdminListSlice,
} from "@/lib/progress-store";

/** Shared by every admin page. Short enough that a dashboard stays current. */
export const ADMIN_LIST_CACHE_SECONDS = 45;

export const ADMIN_USER_PROGRESS_TAG = "admin-user-progress";
export const ADMIN_DUELS_TAG = "admin-duels";
export const ADMIN_LISTENING_RUNS_TAG = "admin-listening-runs";

/**
 * Server data cache only. Admin pages still call `requireAdmin()` and
 * `connection()`, so these rows are not a public page or CDN response.
 * The key is the list itself, never the date-range tab.
 */
const cachedUserProgress = unstable_cache(
  async (slice: AdminListSlice) => listAllUserProgress(slice),
  ["admin-user-progress"],
  { revalidate: ADMIN_LIST_CACHE_SECONDS, tags: [ADMIN_USER_PROGRESS_TAG] },
);

const cachedAdminDuels = unstable_cache(async () => listAdminDuels(), ["admin-duels"], {
  revalidate: ADMIN_LIST_CACHE_SECONDS,
  tags: [ADMIN_DUELS_TAG],
});

const cachedAdminListeningRuns = unstable_cache(
  async () => listAdminListeningRuns(),
  ["admin-listening-runs"],
  { revalidate: ADMIN_LIST_CACHE_SECONDS, tags: [ADMIN_LISTENING_RUNS_TAG] },
);

export function listCachedUserProgress(slice: AdminListSlice = "account") {
  return cachedUserProgress(slice);
}

export function listCachedAdminDuels() {
  return cachedAdminDuels();
}

export function listCachedAdminListeningRuns() {
  return cachedAdminListeningRuns();
}
