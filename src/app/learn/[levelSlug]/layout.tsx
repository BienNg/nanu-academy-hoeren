import { notFound } from "next/navigation";
import { getCefrLevel } from "@/lib/levels";

type LearnLevelLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ levelSlug: string }>;
};

export default async function LearnLevelLayout({
  children,
  params,
}: LearnLevelLayoutProps) {
  const { levelSlug } = await params;
  if (!getCefrLevel(levelSlug)) {
    notFound();
  }
  return children;
}
