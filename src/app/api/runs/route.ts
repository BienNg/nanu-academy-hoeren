import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ListeningSchemaError, parseListeningRunInput } from "@/lib/listening-runs";
import { insertListeningRun, isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import { grantXpForListeningRun } from "@/lib/xp-store";
import { recordPracticeBoxes } from "@/lib/leitner-store";

function revokedResponse() {
  return NextResponse.json(
    { error: "Account deleted", revoked: true },
    { status: 410 },
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json(
      { error: "Cloud progress store is not configured" },
      { status: 503 },
    );
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const run = parseListeningRunInput(body);
  if (!run) {
    return NextResponse.json({ error: "Invalid run" }, { status: 400 });
  }

  try {
    const inserted = await insertListeningRun(session.user.id, run);
    if (inserted) await recordPracticeBoxes(session.user.id, run);
  } catch (error) {
    if (error instanceof ListeningSchemaError) {
      return NextResponse.json({ error: "Listening runs are not set up" }, { status: 503 });
    }
    console.error("POST /api/runs", error);
    return NextResponse.json({ error: "Could not save this run" }, { status: 500 });
  }

  const grant = await grantXpForListeningRun(session.user.id, run);
  return NextResponse.json({ ok: true, xp: grant.xp, kind: grant.kind, ready: grant.ready });
}
