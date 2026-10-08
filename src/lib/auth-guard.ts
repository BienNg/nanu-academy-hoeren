import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminUser, type AdminDashboardRole } from "@/lib/admins";
import { classKey } from "@/lib/admin-overview";
import {
  getUserDashboardFlags,
  getUserInterviewAccess,
  getUserLevelAccess,
  getUserLivingAccess,
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

export type DashboardAccess = {
  session: Awaited<ReturnType<typeof requireUser>>;
  role: AdminDashboardRole;
  /** Null for the owner and staff. A teacher's assigned class keys otherwise. */
  teacherClassKeys: ReadonlySet<string> | null;
};

/**
 * Owner, staff, or teacher. Teachers are limited to `teacherClassKeys`.
 * Everyone else gets a 404.
 */
export async function requireDashboard(): Promise<DashboardAccess> {
  const session = await requireUser();
  if (isAdminUser(session.user)) {
    return { session, role: "owner", teacherClassKeys: null };
  }
  const flags = session.user.id
    ? await getUserDashboardFlags(session.user.id)
    : { staff: false, teacher: false, classes: [] };
  if (flags.staff) return { session, role: "staff", teacherClassKeys: null };
  if (flags.teacher) {
    return {
      session,
      role: "teacher",
      teacherClassKeys: new Set(flags.classes.map((name) => classKey(name)).filter((key) => key.length > 0)),
    };
  }
  notFound();
}

/**
 * Full admins and staff. Teachers and everyone else get a 404.
 * Staff can read stats and grant access; delete stays with the full admin.
 */
export async function requireAdmin() {
  const access = await requireDashboard();
  if (access.role === "teacher") notFound();
  return access.session;
}

/**
 * Admins open every trail. A teacher opens every playable node in a course
 * they were granted. The page still checks that grant first.
 */
export async function unlocksLessonPath(user: {
  id?: string | null;
  email?: string | null;
}): Promise<boolean> {
  if (isAdminUser(user)) return true;
  if (!user.id) return false;
  return (await getUserDashboardFlags(user.id)).teacher;
}
