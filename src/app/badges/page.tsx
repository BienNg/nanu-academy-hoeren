import type { Metadata } from "next";
import { BadgesScreen } from "@/components/BadgesScreen";
import { requireUser } from "@/lib/auth-guard";

export const metadata: Metadata = {
  title: "Huy hiệu",
};

export const dynamic = "force-dynamic";

/** Badges load in the browser, because checking them also stores new unlocks. */
export default async function BadgesPage() {
  await requireUser();
  return <BadgesScreen />;
}
