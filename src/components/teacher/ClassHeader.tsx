import Link from "next/link";
import type { TeacherSiteAccess } from "@/lib/auth-guard";
import { listTeacherClassKeys, readTeacherClass, type TeacherClass } from "@/lib/teacher-store";
import { teacherBase } from "@/lib/teacher-base";
import { classHref } from "./TeacherUi";

/** Class switcher and the Phản hồi | Học viên tabs (T2, T4). */
export async function ClassHeader({
  access,
  data,
  tab,
}: {
  access: TeacherSiteAccess & { kind: "allowed" };
  data: TeacherClass;
  tab: "feedback" | "students";
}) {
  const base = await teacherBase();
  const keys = await listTeacherClassKeys(access.classKeys);
  const others = (await Promise.all(keys.filter((key) => key !== data.key).map((key) => readTeacherClass(key)))).filter(
    (entry): entry is TeacherClass => entry !== null,
  );
  const behind = data.students.filter((student) => student.reasons.length > 0).length;
  const tabClass = (on: boolean) =>
    `flex min-h-11 items-center gap-2 border-b-[3px] px-4 font-[family-name:var(--font-plus-jakarta-sans)] text-[15px] ${
      on ? "border-[#0066cc] font-extrabold text-[#0059b5]" : "border-transparent font-bold text-[#5e5e63] hover:text-[#1b1b1d]"
    }`;

  return (
    <div className="border-b border-[#e5e5ea] bg-white">
      <div className="mx-auto max-w-[1200px] px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <details className="group relative">
            <summary className="flex h-11 cursor-pointer list-none items-center gap-2.5 rounded-[14px] border border-[#d1d1d6] bg-white px-3.5 [&::-webkit-details-marker]:hidden">
              <span className="font-[family-name:var(--font-plus-jakarta-sans)] text-[20px] font-extrabold">{data.name}</span>
              <span className="text-[14px] font-semibold text-[#5e5e63]">
                {[data.levelLabel, `${data.students.length} học viên`].filter(Boolean).join(" · ")}
              </span>
              {others.length > 0 ? (
                <span className="material-symbols-outlined text-[20px] text-[#5e5e63] transition-transform group-open:rotate-180" aria-hidden="true">
                  expand_more
                </span>
              ) : null}
            </summary>
            {others.length > 0 ? (
              <ul className="absolute left-0 z-20 mt-2 min-w-[240px] rounded-2xl border border-[#e5e5ea] bg-white p-1.5 shadow-[0_12px_32px_rgba(17,24,39,0.12)]">
                {others.map((entry) => (
                  <li key={entry.key}>
                    <Link
                      href={classHref(base, entry.key, tab === "students" ? "/students" : "")}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 hover:bg-[#f4f6fb]"
                    >
                      <span className="font-bold">{entry.name}</span>
                      <span className="text-[13px] text-[#5e5e63]">{entry.levelLabel ?? ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
          {data.scheduleLine ? <p className="text-[14px] text-[#5e5e63]">{data.scheduleLine}</p> : null}
        </div>
        <nav aria-label="Lớp" className="mt-3.5 flex gap-1">
          <Link href={classHref(base, data.key)} aria-current={tab === "feedback" ? "page" : undefined} className={tabClass(tab === "feedback")}>
            Phản hồi
          </Link>
          <Link
            href={classHref(base, data.key, "/students")}
            aria-current={tab === "students" ? "page" : undefined}
            className={tabClass(tab === "students")}
          >
            Học viên
            {behind > 0 ? (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#e0352b] px-1.5 text-[12px] font-bold text-white">
                <span className="sr-only">, chậm tiến độ: </span>
                {behind}
              </span>
            ) : null}
          </Link>
        </nav>
      </div>
    </div>
  );
}
