import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { createDuel, getDuelHome, listUnstartedChallenges } from "@/lib/duel-store";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import { emptyDuelHome } from "@/lib/duels";

function revokedResponse() {
  return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
}

async function viewer() {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isProgressStoreConfigured()) {
    return { response: NextResponse.json(emptyDuelHome(false), { status: 200 }) };
  }
  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return { response: revokedResponse() };
  return { user: session.user };
}

export async function GET(request: Request) {
  const gate = await viewer();
  if ("response" in gate && gate.response) return gate.response;
  if (!("user" in gate) || !gate.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (new URL(request.url).searchParams.get("badge") === "1") {
    const challenges = await listUnstartedChallenges(gate.user.id);
    return NextResponse.json({ count: challenges.length, challenges });
  }
  const home = await getDuelHome({ id: gate.user.id, email: gate.user.email });
  return NextResponse.json(home);
}

export async function POST() {
  const gate = await viewer();
  if ("response" in gate && gate.response) {
    if (!isProgressStoreConfigured()) {
      return NextResponse.json({ ok: false, block: "unavailable" }, { status: 503 });
    }
    return gate.response;
  }
  if (!("user" in gate) || !gate.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const created = await createDuel({ id: gate.user.id, email: gate.user.email });
  return NextResponse.json(created);
}
