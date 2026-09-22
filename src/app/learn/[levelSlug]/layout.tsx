import { notFound } from "next/navigation";
import { requireLevelAccess, requireUser } from "@/lib/auth-guard";
import { getCefrLevel } from "@/lib/levels";

type LearnLevelLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ levelSlug: string }>;
};

export default async function LearnLevelLayout({
  children,
  params,
}: LearnLevelLayoutProps) {
  const session = await requireUser();
  const { levelSlug } = await params;
  if (!getCefrLevel(levelSlug)) {
    notFound();
  }
  await requireLevelAccess(session.user, levelSlug);
  return children;
}
