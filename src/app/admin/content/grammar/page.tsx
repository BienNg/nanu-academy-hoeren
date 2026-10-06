import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminGrammar } from "@/components/admin/AdminGrammar";
import { buildAdminGrammarBoard } from "@/lib/admin-grammar";
import { requireAdmin } from "@/lib/auth-guard";

export const metadata: Metadata = {
  title: "Grammar gaps · Admin · NaNu Academy",
  robots: { index: false, follow: false },
};

export default async function AdminGrammarPage() {
  await connection();
  await requireAdmin();
  return <AdminGrammar board={buildAdminGrammarBoard()} />;
}
