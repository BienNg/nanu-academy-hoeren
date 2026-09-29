import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminDuels } from "@/components/admin/AdminDuels";
import {
  buildAdminDuelBoard,
  parseAdminRange,
  toAdminUserRow,
  withSessionIdentity,
} from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import { listAdminDuels } from "@/lib/duel-store";
import {
  isProgressStoreConfigured,
  listAllUserProgress,
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
  const session = await requireAdmin();
  const range = parseAdminRange((await searchParams).range);

  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const items = storeConfigured ? await listAllUserProgress() : [];
  const rows = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );

  const duels = storeConfigured
    ? await listAdminDuels()
    : { ready: false, rows: [] };

  return (
    <AdminDuels
      board={buildAdminDuelBoard(rows, duels.rows, range)}
      range={range}
      storeConfigured={storeConfigured}
      duelsReady={duels.ready}
    />
  );
}
