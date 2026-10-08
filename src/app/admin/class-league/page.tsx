import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminClassLeague } from "@/components/admin/AdminClassLeague";
import { limitAdminClassLeague, parseResultWeek } from "@/lib/admin-class-league";
import { requireDashboard } from "@/lib/auth-guard";
import { readAdminClassLeague } from "@/lib/class-quest-store";
import { isProgressStoreConfigured, touchUserProfile } from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Class league · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminClassLeaguePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const access = await requireDashboard();
  const session = access.session;
  const now = new Date();
  const resultWeek = parseResultWeek((await searchParams).week, now);

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const data = storeConfigured
    ? await readAdminClassLeague(now, resultWeek)
    : { ready: false, podiumsReady: false, league: null };

  return (
    <AdminClassLeague
      league={data.league ? limitAdminClassLeague(data.league, access.teacherClassKeys) : null}
      storeConfigured={storeConfigured}
      ready={data.ready}
      podiumsReady={data.podiumsReady}
    />
  );
}
