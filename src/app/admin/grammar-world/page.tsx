import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminGrammarWorld } from "@/components/admin/AdminGrammarWorld";
import { worldAreas } from "@/data/grammar/world";
import { adminRangeVietnamInterval, parseAdminRange, toAdminUserRow, withSessionIdentity } from "@/lib/admin-overview";
import { listCachedUserProgress } from "@/lib/admin-list-cache";
import { requireAdmin } from "@/lib/auth-guard";
import { listAdminGrammarWorldRuns } from "@/lib/grammar-world-runs-store";
import type { GrammarWorldTopicLabel } from "@/lib/grammar-world-runs";
import { isProgressStoreConfigured, touchUserProfile } from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Grammar world · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminGrammarWorldPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const session = await requireAdmin();
  const range = parseAdminRange((await searchParams).range);
  const interval = adminRangeVietnamInterval(range);

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const topics: GrammarWorldTopicLabel[] = worldAreas.flatMap((area) =>
    area.topics.map((topic) => ({
      id: topic.id,
      titleDe: topic.titleDe,
      titleVi: topic.titleVi,
      areaDe: area.titleDe,
    })),
  );

  const log = storeConfigured
    ? await listAdminGrammarWorldRuns(interval.from, interval.to)
    : { status: "error" as const, runs: [], left: [], misses: [], capped: false };

  const items = storeConfigured ? await listCachedUserProgress("account") : [];
  const people = items.map((item) => {
    const row = toAdminUserRow(withSessionIdentity(item, session.user));
    return { id: row.userId, name: row.displayName };
  });

  return (
    <AdminGrammarWorld
      status={storeConfigured ? log.status : "error"}
      capped={log.capped}
      runs={log.runs}
      left={log.left}
      misses={log.misses}
      people={people}
      topics={topics}
    />
  );
}
