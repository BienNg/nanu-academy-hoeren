import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { normalizeProgress, type StoredProgress } from "@/lib/progress";
import {
  getCloudProgress,
  isProgressStoreConfigured,
  setCloudProgress,
} from "@/lib/progress-store";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isProgressStoreConfigured()) {
    return NextResponse.json(
      {
        progress: null,
        configured: false,
        message: "Cloud progress store is not configured",
      },
      { status: 200 },
    );
  }

  const progress = await getCloudProgress(session.user.id);
  return NextResponse.json({ progress, configured: true });
}

export async function PUT(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const progress = normalizeProgress(body as Partial<StoredProgress>);
  await setCloudProgress(session.user.id, progress);
  return NextResponse.json({ progress, ok: true });
}
