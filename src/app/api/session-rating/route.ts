import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isProgressStoreConfigured, resolveAccountAccess } from "@/lib/progress-store";
import { RATING_DONE_COOKIE, answerRating, ratingDoneCookieValue } from "@/lib/session-rating-store";

const STATUS = { invalid: 400, closed: 409, answered: 409, unavailable: 503 } as const;

/**
 * `{ classKey, sessionDate, stars, tags, comment }` rates the learner's open
 * class session; `{ classKey, sessionDate, dismiss: true }` is "Để sau".
 * There is no GET: Home reads the pending session while it renders.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isProgressStoreConfigured()) return NextResponse.json({ denial: "unavailable" }, { status: 503 });

  const access = await resolveAccountAccess(session.user.id, session.user.authAt);
  if (access === "revoked") {
    return NextResponse.json({ error: "Account deleted", revoked: true }, { status: 410 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ denial: "invalid" }, { status: 400 });
  }

  try {
    const result = await answerRating({ id: session.user.id, email: session.user.email }, body, new Date());
    if (!result.ok) return NextResponse.json({ denial: result.denial }, { status: STATUS[result.denial] });

    const response = NextResponse.json({ xp: result.xp });
    response.cookies.set(RATING_DONE_COOKIE, ratingDoneCookieValue(result.session.classKey, result.session.day), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires: new Date(result.session.closesAt),
    });
    return response;
  } catch (error) {
    console.error("POST /api/session-rating", error);
    return NextResponse.json({ denial: "unavailable" }, { status: 500 });
  }
}
