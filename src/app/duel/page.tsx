import { DuelHomeScreen } from "@/components/DuelHomeScreen";
import { requireUser } from "@/lib/auth-guard";
import { getDuelHome } from "@/lib/duel-store";

export const dynamic = "force-dynamic";

export default async function DuelPage() {
  const session = await requireUser();
  const initial = await getDuelHome({ id: session.user.id, email: session.user.email });
  return <DuelHomeScreen initial={initial} />;
}
