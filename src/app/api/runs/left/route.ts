import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parsePartLeftInput } from "@/lib/part-difficulty";
import { PartDifficultySchemaError, markPartLeft } from "@/lib/part-difficulty-store";
import { isProgressStoreConfigured } from "@/lib/progress-store";

/** The learner left a practice part before it ended: how many cards they finished. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ error: "Cloud progress store is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const left = parsePartLeftInput(body);
  if (!left) {
    return NextResponse.json({ error: "Invalid leave" }, { status: 400 });
  }

  try {
    await markPartLeft(session.user.id, left);
  } catch (error) {
    if (error instanceof PartDifficultySchemaError) {
      return NextResponse.json({ error: "Part starts are not set up" }, { status: 503 });
    }
    console.error("POST /api/runs/left", error);
    return NextResponse.json({ error: "Could not save this leave" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
