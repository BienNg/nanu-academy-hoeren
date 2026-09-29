import type { Metadata } from "next";
import { connection } from "next/server";
import {
  AdminBlitzrunde,
  type AdminClassProgress,
  type BlitzrundeLevelOption,
} from "@/components/admin/AdminBlitzrunde";
import { classKey, listAdminClasses, toAdminUserRow, withSessionIdentity } from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import { buildClassProgress } from "@/lib/blitzrunde";
import { listAdminRounds, listRankedResults } from "@/lib/blitzrunde-store";
import { getAvailableChapters, getAvailableLevels } from "@/lib/levels";
import { isProgressStoreConfigured, listAllUserProgress } from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Blitzrunde · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminBlitzrundePage() {
  await connection();
  const session = await requireAdmin();

  const storeConfigured = isProgressStoreConfigured();
  const items = storeConfigured ? await listAllUserProgress() : [];
  const rows = items.map((item) => toAdminUserRow(withSessionIdentity(item, session.user)));
  const classes = listAdminClasses(rows);

  const levels: BlitzrundeLevelOption[] = getAvailableLevels().map((level) => ({
    slug: level.slug,
    label: level.level,
    chapters: getAvailableChapters(level.slug).map((chapter) => ({
      slug: chapter.slug,
      label: chapter.label,
    })),
  }));

  const rounds = storeConfigured ? await listAdminRounds() : { ready: false, rounds: [] };

  // Running totals per class. Results stay in the class the round was played in.
  const results = storeConfigured && rounds.ready ? ((await listRankedResults()) ?? []) : [];
  const names = Object.fromEntries(rows.map((row) => [row.userId, row.displayName]));
  const progress: AdminClassProgress[] = [...new Set(results.map((result) => result.classKey))]
    .flatMap((key) => {
      const members = new Set(rows.filter((row) => classKey(row.className) === key).map((row) => row.userId));
      const built = buildClassProgress(results, key, members);
      if (!built) return [];
      const lineNames = Object.fromEntries(built.series.map((line) => [line.userId, names[line.userId] ?? "Student"]));
      return [{ ...built, names: lineNames }];
    })
    .sort((left, right) =>
      (right.rounds[right.rounds.length - 1]?.playedAt ?? "").localeCompare(left.rounds[left.rounds.length - 1]?.playedAt ?? ""),
    );

  return (
    <AdminBlitzrunde
      classes={classes}
      levels={levels}
      initialRounds={rounds.rounds}
      roundsReady={rounds.ready}
      schemaHint={"hint" in rounds ? rounds.hint : undefined}
      storeConfigured={storeConfigured}
      progress={progress}
    />
  );
}
