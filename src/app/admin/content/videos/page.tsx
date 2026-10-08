import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminVideos } from "@/components/admin/AdminVideos";
import { buildAdminVideoBoard } from "@/lib/admin-catalog";
import { toAdminUserRow, withSessionIdentity } from "@/lib/admin-overview";
import { listCachedUserProgress } from "@/lib/admin-list-cache";
import { requireAdmin } from "@/lib/auth-guard";
import {
  isProgressStoreConfigured,
  touchUserProfile,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Videos · Admin",
  robots: { index: false, follow: false },
};

export default async function AdminVideosPage() {
  await connection();
  const session = await requireAdmin();
  const storeConfigured = isProgressStoreConfigured();
  if (storeConfigured && session.user.id) {
    await touchUserProfile(session.user.id, {
      email: session.user.email,
      name: session.user.name,
    });
  }

  const items = storeConfigured ? await listCachedUserProgress("videos") : [];
  const people = items.map((item) =>
    toAdminUserRow(withSessionIdentity(item, session.user)),
  );

  return (
    <AdminVideos
      board={buildAdminVideoBoard(people)}
      storeConfigured={storeConfigured}
    />
  );
}
