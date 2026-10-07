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
import { requireAdmin } from "@/lib/auth-guard";
import { getAvailableBerufe, getSessionClips } from "@/lib/content";
import {
  isProgressStoreConfigured,
  listPendingLevelGrants,
  touchUserProfile,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Outreach · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminOutreachPage() {
  await connection();
  const session = await requireAdmin();

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

  const items = storeConfigured ? await listCachedUserProgress("outreach") : [];
  const pending = storeConfigured ? await listPendingLevelGrants() : [];
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
      catalog={catalog}
      storeConfigured={storeConfigured}
      pendingReady={pending !== null}
    />
  );
}
