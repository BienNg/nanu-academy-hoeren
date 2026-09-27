import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import { getUserXpTotals } from "@/lib/xp-store";

function revokedResponse() {
  return NextResponse.json(
    { error: "Account deleted", revoked: true },
    { status: 410 },
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ ready: false, today: 0, week: 0, total: 0 });
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  const totals = await getUserXpTotals(session.user.id);
  return NextResponse.json(totals);
}
