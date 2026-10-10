import { NextResponse } from "next/server";
import { sendDueStreakReminders } from "@/lib/push-store";

export const maxDuration = 60;

/**
 * Vercel Cron calls this once a day at 12:00 UTC (19:00 in Vietnam).
 * Set CRON_SECRET on the project; Vercel sends it as a bearer token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await sendDueStreakReminders();
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/push/remind", error);
    return NextResponse.json({ ready: false, sent: 0, skipped: 0, removed: 0, failed: 0 }, { status: 500 });
  }
}
