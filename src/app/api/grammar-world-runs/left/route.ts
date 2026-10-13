import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { parseGrammarWorldLeftInput } from "@/lib/grammar-world-runs";
import { GrammarWorldRunSchemaError, markGrammarWorldLeft } from "@/lib/grammar-world-runs-store";
import { isProgressStoreConfigured } from "@/lib/progress-store";

/** The learner left a grammar-world part before it ended. */
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
  const left = parseGrammarWorldLeftInput(body);
  if (!left) {
    return NextResponse.json({ error: "Invalid leave" }, { status: 400 });
  }

  try {
    await markGrammarWorldLeft(session.user.id, left);
  } catch (error) {
    if (error instanceof GrammarWorldRunSchemaError) {
      return NextResponse.json({ error: "Grammar world runs are not set up" }, { status: 503 });
    }
    console.error("POST /api/grammar-world-runs/left", error);
    return NextResponse.json({ error: "Could not save this leave" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
