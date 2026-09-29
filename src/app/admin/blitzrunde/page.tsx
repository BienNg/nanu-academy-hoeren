import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminBlitzrunde, type BlitzrundeLevelOption } from "@/components/admin/AdminBlitzrunde";
import { listAdminClasses, toAdminUserRow, withSessionIdentity } from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import { listAdminRounds } from "@/lib/blitzrunde-store";
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

  return (
    <AdminBlitzrunde
      classes={classes}
      levels={levels}
      initialRounds={rounds.rounds}
      roundsReady={rounds.ready}
      schemaHint={"hint" in rounds ? rounds.hint : undefined}
      storeConfigured={storeConfigured}
    />
  );
}
