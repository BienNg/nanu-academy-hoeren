import type { Metadata } from "next";
import { QuestsScreen } from "@/components/QuestsScreen";
import { requireUser } from "@/lib/auth-guard";

export const metadata: Metadata = {
  title: "Nhiệm vụ · NaNu Academy",
};

export const dynamic = "force-dynamic";

/** Quests load in the browser, because the quest day follows the device's time zone. */
export default async function QuestsPage() {
  await requireUser();
  return <QuestsScreen />;
}
