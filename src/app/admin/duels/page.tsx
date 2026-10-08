import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminDuels } from "@/components/admin/AdminDuels";
import {
  parseAdminRange,
  rowsForClassScope,
  toAdminUserRow,
  withSessionIdentity,
} from "@/lib/admin-overview";
import { listCachedAdminDuels, listCachedUserProgress } from "@/lib/admin-list-cache";
import { requireDashboard } from "@/lib/auth-guard";
import {
  isProgressStoreConfigured,
  touchUserProfile,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Duels · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminDuelsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const access = await requireDashboard();
  const session = access.session;
  const range = parseAdminRange((await searchParams).range);

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const items = storeConfigured ? await listCachedUserProgress("account") : [];
  const rows = rowsForClassScope(
    items.map((item) => toAdminUserRow(withSessionIdentity(item, session.user))),
    access.teacherClassKeys,
  );
  const studentIds = access.teacherClassKeys
    ? new Set(rows.map((row) => row.userId))
    : null;

  const duels = storeConfigured
    ? await listCachedAdminDuels()
    : { ready: false, rows: [] };

  return (
    <AdminDuels
      people={rows}
      duels={
        studentIds
          ? duels.rows.filter(
              (row) => studentIds.has(row.challengerId) || studentIds.has(row.opponentId),
            )
          : duels.rows
      }
      range={range}
      storeConfigured={storeConfigured}
      duelsReady={duels.ready}
    />
  );
}
