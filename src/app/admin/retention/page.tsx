import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ADMIN_RANGES } from "@/lib/admin-overview";

/** Retention now lives on Activity. Old links keep their date window. */
export default async function AdminRetentionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await connection();
  const raw = (await searchParams).range;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const range = value && (ADMIN_RANGES as readonly string[]).includes(value) ? value : null;
  redirect(range ? `/admin/activity?range=${range}` : "/admin/activity");
}
