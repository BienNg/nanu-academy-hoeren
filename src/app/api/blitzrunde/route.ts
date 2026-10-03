import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLiveRoundForUser } from "@/lib/blitzrunde-store";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";

/** The open Blitzrunde for the viewer's class, if any. The lesson page reads this when the tab returns, and every few seconds while a round is on screen. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProgressStoreConfigured()) return NextResponse.json({ live: null });
  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") {
    return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
  }
  const live = await getLiveRoundForUser(session.user.id);
  return NextResponse.json({ live }, { headers: { "Cache-Control": "no-store" } });
}
