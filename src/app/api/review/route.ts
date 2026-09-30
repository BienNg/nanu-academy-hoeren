import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import { parseReviewSubmit } from "@/lib/review";
import { getReviewSummary, recordReviewSession } from "@/lib/review-store";

function revokedResponse() {
  return NextResponse.json(
    { error: "Account deleted", revoked: true },
    { status: 410 },
  );
}

/** Due review count for the Home card and the nav badge. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProgressStoreConfigured()) {
    return NextResponse.json({ ready: false, due: 0, total: 0 });
  }

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") return revokedResponse();

  const summary = await getReviewSummary({ id: session.user.id, email: session.user.email });
  return NextResponse.json(summary);
}

/** One finished review session. */
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

  const input = parseReviewSubmit(body);
  if (!input) {
    return NextResponse.json({ error: "Invalid review" }, { status: 400 });
  }

  const grant = await recordReviewSession(
    { id: session.user.id, email: session.user.email },
    input,
  );
  return NextResponse.json({ ok: true, ...grant });
}
