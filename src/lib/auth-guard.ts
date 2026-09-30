import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminUser } from "@/lib/admins";
import {
  getUserInterviewAccess,
  getUserLevelAccess,
  getUserLivingAccess,
  getUserStaff,
  resolveAccountAccess,
} from "@/lib/progress-store";

/** Allow only same-origin relative paths after Google sign-in. */
export function safeCallbackUrl(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "/";

  let path = raw;
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      const url = new URL(raw);
      path = `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return "/";
  }

  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return "/";
  }
  if (
    path === "/account" ||
    path.startsWith("/account/") ||
    path.startsWith("/account?")
  ) {
    return "/";
  }
  return path;
}

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/account");
  }

  const access = await resolveAccountAccess(
    session.user.id,
    session.user.authAt,
  );
  if (access === "revoked") {
    redirect("/session-ended");
  }

  return session;
}

/**
 * Admins can open every CEFR level. Everyone else needs an explicit grant,
 * and a missing grant sends them back to Home.
 */
export async function requireLevelAccess(
  user: { id?: string | null; email?: string | null },
  levelSlug: string,
): Promise<void> {
  if (isAdminUser(user)) return;
  if (!user.id) {
    redirect("/");
  }
  const granted = await getUserLevelAccess(user.id);
  if (!granted.includes(levelSlug)) {
    redirect("/");
  }
}

/**
 * Admins can open every interview course. Everyone else needs an explicit
 * grant, and a missing grant sends them back to Home.
 */
export async function requireInterviewAccess(user: {
  id?: string | null;
  email?: string | null;
}): Promise<void> {
  if (isAdminUser(user)) return;
  if (!user.id) {
    redirect("/");
  }
  const granted = await getUserInterviewAccess(user.id);
  if (!granted) {
    redirect("/");
  }
}

/**
 * Admins can open every Leben-in-Deutschland workplace. Everyone else needs
 * the `living-<workplace>` grant, and a missing grant sends them back to Home.
 */
export async function requireLivingAccess(
  user: { id?: string | null; email?: string | null },
  workplaceSlug: string,
): Promise<void> {
  if (isAdminUser(user)) return;
  if (!user.id) {
    redirect("/");
  }
  const granted = await getUserLivingAccess(user.id);
  if (!granted.includes(workplaceSlug)) {
    redirect("/");
  }
}

/**
 * Full admins and staff. Everyone else gets a 404 — no admin UI or data.
 * Staff can read stats and grant access; delete stays with the full admin.
 */
export async function requireAdmin() {
  const session = await requireUser();
  if (isAdminUser(session.user)) return session;
  if (session.user.id && (await getUserStaff(session.user.id))) return session;
  notFound();
}
