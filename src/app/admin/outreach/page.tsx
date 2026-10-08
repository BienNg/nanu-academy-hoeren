import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminOutreach } from "@/components/admin/AdminOutreach";
import { buildAdminCourseCatalog } from "@/lib/admin-catalog";
import {
  buildOutreachPeople,
  shortBerufLabel,
  toAdminUserRow,
  withSessionIdentity,
  type AdminTrackColumn,
} from "@/lib/admin-overview";
import { listCachedUserProgress } from "@/lib/admin-list-cache";
import { listOutreachCases } from "@/lib/outreach-store";
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  isProgressStoreConfigured,
  listPendingLevelGrants,
  touchUserProfile,
} from "@/lib/progress-store";
import { dayKey } from "@/lib/xp";

export const metadata: Metadata = {
  title: "Outreach · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminOutreachPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const session = await requireAdmin();
  const query = await searchParams;

  const tracks: AdminTrackColumn[] = getAvailableBerufe().map((beruf) => ({
    slug: beruf.slug,
    label: beruf.label,
    shortLabel: shortBerufLabel(beruf.label),
    totalClips: getSessionClips(beruf.slug).length,
  }));
  const catalog = buildAdminCourseCatalog(tracks);

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const [items, pending, cases] = storeConfigured
    ? await Promise.all([
        listCachedUserProgress("outreach"),
        listPendingLevelGrants(),
        listOutreachCases(),
      ])
    : [[], [], []];
  const rows = items.map((item) => toAdminUserRow(withSessionIdentity(item, session.user)));
  const people = buildOutreachPeople(
    rows,
    (pending ?? []).map((grant) => ({
      email: grant.email,
      className: grant.className,
      updatedAt: grant.updatedAt,
    })),
  );

  return (
    <AdminOutreach
      people={people}
      cases={cases ?? []}
      casesReady={cases !== null}
      today={dayKey(new Date())}
      viewerId={session.user.id ?? ""}
      catalog={catalog}
      storeConfigured={storeConfigured}
      pendingReady={pending !== null}
      initialView={query.view === "picture" ? "picture" : "queue"}
      initialJob={typeof query.job === "string" ? query.job : null}
    />
  );
}
