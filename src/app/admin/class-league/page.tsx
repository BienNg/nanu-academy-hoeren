import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminClassLeague } from "@/components/admin/AdminClassLeague";
import { limitAdminClassLeague } from "@/lib/admin-class-league";
import { requireDashboard } from "@/lib/auth-guard";
import { readAdminClassLeague } from "@/lib/class-quest-store";
import { isProgressStoreConfigured, touchUserProfile } from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Class league · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminClassLeaguePage() {
  await connection();
  const access = await requireDashboard();
  const session = access.session;

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const data = storeConfigured
    ? await readAdminClassLeague()
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
