import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { markOnboardingComplete } from "@/lib/onboarding-store";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";

/** The learner stepped through the whole map tour. It never shows again. */
export async function POST() {
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

  const saved = await markOnboardingComplete(session.user.id);
  return NextResponse.json({ saved }, { status: saved ? 200 : 500 });
}
