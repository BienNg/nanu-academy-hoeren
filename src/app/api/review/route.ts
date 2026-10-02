import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import {
  countDueReviews,
  LeitnerSchemaError,
  parseReviewAnswers,
  saveReviewAnswers,
} from "@/lib/leitner-store";

function revokedResponse() {
  return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
}

async function viewer() {
  const session = await auth();
  if (!session?.user?.id) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isProgressStoreConfigured()) {
    return {
      response: NextResponse.json({ error: "Cloud progress store is not configured" }, { status: 503 }),
    };
  }
  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return { response: revokedResponse() };
  return { user: { id: session.user.id, email: session.user.email } };
}

/** Clips due today, for the bottom navigation badge. */
export async function GET() {
  const gate = await viewer();
  if (!gate.user) return gate.response;
  return NextResponse.json({ count: await countDueReviews(gate.user) });
}

/** A finished review round. Moves the boxes; no XP or streak. */
export async function POST(request: Request) {
  const gate = await viewer();
  if (!gate.user) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const answers = parseReviewAnswers(body);
  if (!answers) return NextResponse.json({ error: "Invalid review" }, { status: 400 });

  try {
    const saved = await saveReviewAnswers(gate.user, answers);
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    if (error instanceof LeitnerSchemaError) {
      return NextResponse.json({ error: "Review boxes are not set up" }, { status: 503 });
    }
    console.error("POST /api/review", error);
    return NextResponse.json({ error: "Could not save this review" }, { status: 500 });
  }
}
