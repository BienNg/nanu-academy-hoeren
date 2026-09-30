import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminActivity } from "@/components/admin/AdminActivity";
import {
  parseAdminRange,
  toAdminUserRow,
  withSessionIdentity,
} from "@/lib/admin-overview";
import { requireAdmin } from "@/lib/auth-guard";
import {
  isProgressStoreConfigured,
  listAllUserProgress,
  touchUserProfile,
} from "@/lib/progress-store";

export const metadata: Metadata = {
  title: "Activity · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminActivityPage({
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

  return (
    <AdminActivity
      rows={rows}
      range={range}
      storeConfigured={storeConfigured}
    />
  );
}
