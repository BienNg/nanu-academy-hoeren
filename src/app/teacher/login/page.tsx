import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TeacherLogin } from "@/components/teacher/TeacherClient";
import { readTeacherSiteAccess } from "@/lib/auth-guard";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function TeacherLoginPage() {
  const access = await readTeacherSiteAccess();
  if (access.kind === "allowed") redirect("/");
  return <TeacherLogin denied={access.kind === "denied"} email={access.kind === "denied" ? access.email : null} />;
}
