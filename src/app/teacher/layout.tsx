import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/teacher/TeacherUi";
import { SignOutButton } from "@/components/teacher/TeacherClient";
import { readTeacherSiteAccess } from "@/lib/auth-guard";
import { teacherBase } from "@/lib/teacher-base";

export const metadata: Metadata = {
  title: { default: "Giáo viên", template: "%s · Giáo viên NaNu Go" },
  robots: { index: false, follow: false },
};

/** teacher.nanugo.app. The proxy serves this folder there; signed-out visitors land on /login. */
export default async function TeacherLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const access = await readTeacherSiteAccess();
  if (access.kind !== "allowed") return <>{children}</>;
  const name = access.session.user.name ?? access.session.user.email ?? "Giáo viên";
  const base = await teacherBase();

  return (
    <div className="min-h-dvh bg-[#f4f6fb] font-[family-name:var(--font-be-vietnam-pro)] text-[#1b1b1d]">
      <header className="border-b border-[#e5e5ea] bg-white">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
          <Link href={base || "/"} className="flex items-center gap-2.5 text-[#1b1b1d]">
            <span className="font-[family-name:var(--font-plus-jakarta-sans)] text-[19px] font-extrabold tracking-[-0.02em]">
              NaNu Go
            </span>
            <span className="flex h-6 items-center rounded-full bg-[#e8f2ff] px-2 text-[12px] font-bold text-[#0059b5]">
              Giáo viên
            </span>
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="hidden text-[14px] font-semibold sm:inline">{name}</span>
            <Avatar name={name} image={access.session.user.image ?? null} size={34} />
            <SignOutButton base={base} />
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
