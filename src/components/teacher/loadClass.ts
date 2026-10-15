import { notFound } from "next/navigation";
import { canSeeClass, requireTeacherSite, type TeacherSiteAccess } from "@/lib/auth-guard";
import { teacherBase } from "@/lib/teacher-base";
import { readTeacherClass, type TeacherClass } from "@/lib/teacher-store";
import { decodeSegment } from "./TeacherUi";

export type ClassPage = { base: string } & (
  | { kind: "denied"; email: string | null }
  | { kind: "allowed"; access: TeacherSiteAccess & { kind: "allowed" }; data: TeacherClass }
);

/**
 * Every class page starts here: signed-out visitors go to /login, accounts
 * without a teacher role get the denied view, and a class outside the
 * teacher's assignment is a 404 before anything is read.
 */
export async function loadClassPage(rawKey: string): Promise<ClassPage> {
  const access = await requireTeacherSite();
  const base = await teacherBase();
  if (access.kind === "denied") return { kind: "denied", email: access.email, base };
  const key = decodeSegment(rawKey);
  if (!canSeeClass(access, key)) notFound();
  const data = await readTeacherClass(key);
  if (!data) notFound();
  return { kind: "allowed", access, data, base };
}
