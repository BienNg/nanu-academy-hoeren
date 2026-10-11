import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parsePartStartInput } from "@/lib/part-difficulty";
import { PartDifficultySchemaError, insertPartStart } from "@/lib/part-difficulty-store";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";

/** A practice part opened. Only feeds the admin difficulty stats. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ error: "Cloud progress store is not configured" }, { status: 503 });
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") {
    return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const start = parsePartStartInput(body);
  if (!start) {
    return NextResponse.json({ error: "Invalid start" }, { status: 400 });
  }

  try {
    await insertPartStart(session.user.id, start);
  } catch (error) {
    if (error instanceof PartDifficultySchemaError) {
      return NextResponse.json({ error: "Part starts are not set up" }, { status: 503 });
    }
    console.error("POST /api/runs/start", error);
    return NextResponse.json({ error: "Could not save this start" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
