/**
 * Full admins. Hardcoded so a database change cannot lock this role out or
 * hand it to someone else. They can delete accounts and progress, and they
 * can grant staff and teacher access.
 *
 * Staff (`user_progress.staff`) may open the dashboard, see every stat, and
 * grant classes and courses. They cannot delete. They can assign teachers.
 *
 * Teachers (`user_progress.teacher`) are assigned to classes. They can view
 * those classes' progress, activity, XP, duels, class league, and level
 * paths. They cannot grant access, delete, or open the rest of the dashboard.
 * A level grant opens every playable node in that level.
 */
export type AdminDashboardRole = "owner" | "staff" | "teacher";

export const ADMIN_EMAILS = ["bien.nguyen19961@gmail.com"] as const;

export const ADMIN_USER_IDS: readonly string[] = [];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const ADMIN_EMAIL_SET = new Set(
  ADMIN_EMAILS.map((email) => normalizeEmail(email)),
);

const ADMIN_USER_ID_SET = new Set(ADMIN_USER_IDS);

export function isAdminUser(user: {
  email?: string | null;
  id?: string | null;
}): boolean {
  const email = user.email ? normalizeEmail(user.email) : "";
  if (email && ADMIN_EMAIL_SET.has(email)) return true;
  if (user.id && ADMIN_USER_ID_SET.has(user.id)) return true;
  return false;
}
