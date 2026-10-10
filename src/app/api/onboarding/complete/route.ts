import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { markDuelOnboardingComplete, markOnboardingComplete } from "@/lib/onboarding-store";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";

/**
 * The learner stepped through a one-time tour. It never shows again.
 * The body `{ "tour": "duel" }` is the how-to before the first duel; no body is the map tour.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ saved: false, configured: false }, { status: 503 });
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") {
    return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
  }

  const body: unknown = await request.json().catch(() => null);
  const tour = body && typeof body === "object" ? (body as { tour?: unknown }).tour : undefined;
  const saved =
    tour === "duel"
      ? await markDuelOnboardingComplete(session.user.id)
      : await markOnboardingComplete(session.user.id);
  return NextResponse.json({ saved }, { status: saved ? 200 : 500 });
}
