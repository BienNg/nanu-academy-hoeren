import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { worldAreas } from "@/data/grammar/world";
import { parseGrammarWorldStartInput } from "@/lib/grammar-world-runs";
import { GrammarWorldRunSchemaError, insertGrammarWorldStart } from "@/lib/grammar-world-runs-store";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";

function knownTopic(topicId: string): boolean {
  return worldAreas.some((area) => area.topics.some((topic) => topic.id === topicId));
}

/** A grammar-world part opened. The finish reuses this id. */
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
  const start = parseGrammarWorldStartInput(body);
  if (!start || !knownTopic(start.topicId)) {
    return NextResponse.json({ error: "Invalid start" }, { status: 400 });
  }

  try {
    await insertGrammarWorldStart(session.user.id, start);
  } catch (error) {
    if (error instanceof GrammarWorldRunSchemaError) {
      return NextResponse.json({ error: "Grammar world runs are not set up" }, { status: 503 });
    }
    console.error("POST /api/grammar-world-runs/start", error);
    return NextResponse.json({ error: "Could not save this start" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
