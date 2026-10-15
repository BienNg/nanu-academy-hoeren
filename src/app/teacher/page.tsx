import Link from "next/link";
import { RatingPingu } from "@/components/session/Pingu";
import { TeacherLogin } from "@/components/teacher/TeacherClient";
import { CARD, EmptyState, Star, classHref, shortDay } from "@/components/teacher/TeacherUi";
import { requireTeacherSite } from "@/lib/auth-guard";
import { teacherBase } from "@/lib/teacher-base";
import { listTeacherClassKeys, readTeacherClass, type TeacherClass } from "@/lib/teacher-store";

/** T1: one card per class the teacher may open. */
export default async function TeacherHomePage() {
  const access = await requireTeacherSite();
  const base = await teacherBase();
  if (access.kind === "denied") return <TeacherLogin denied email={access.email} base={base} />;

  const keys = await listTeacherClassKeys(access.classKeys);
  const classes = (await Promise.all(keys.map((key) => readTeacherClass(key)))).filter(
    (entry): entry is TeacherClass => entry !== null,
  );
  const firstName = (access.session.user.name ?? "").trim().split(/\s+/).at(-1) ?? "";

  return (
    <main className="mx-auto max-w-[1200px] px-4 pt-9 pb-12 sm:px-6">
      <h1 className="font-[family-name:var(--font-plus-jakarta-sans)] text-[28px] font-extrabold leading-9 tracking-[-0.02em]">
        {firstName ? `Chào ${firstName}, đây là các lớp của bạn` : "Các lớp của bạn"}
      </h1>
      {classes.length === 0 ? (
        <div className="mt-7">
          <EmptyState
            icon={<RatingPingu mood={0} size={110} />}
            title="Chưa có lớp nào"
            text="Tài khoản của bạn chưa được gán lớp. Nhắn quản trị NaNu NaNa để được thêm vào lớp bạn dạy."
          />
        </div>
      ) : (
        <ul className="mt-7 grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr))]">
          {classes.map((entry) => (
            <li key={entry.key}>
              <ClassCard data={entry} base={base} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function ClassCard({ data, base }: { data: TeacherClass; base: string }) {
  const last = data.sessions[0] ?? null;
  const behind = data.students.filter((student) => student.reasons.length > 0).length;
  return (
    <Link
      href={classHref(base, data.key)}
      className={`${CARD} flex h-full flex-col gap-4 p-5 transition-shadow hover:shadow-[0_10px_28px_rgba(17,24,39,0.08)]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-[family-name:var(--font-plus-jakarta-sans)] text-[24px] font-extrabold tracking-[-0.02em]">
              {data.name}
            </span>
            {data.levelLabel ? (
              <span className="flex h-6 items-center rounded-lg bg-[#f0edef] px-2 text-[13px] font-bold">{data.levelLabel}</span>
            ) : null}
          </div>
          <p className="mt-1 text-[14px] text-[#5e5e63]">
            {[`${data.students.length} học viên`, data.scheduleLine].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className="material-symbols-outlined text-[22px] text-[#aeaeb2]" aria-hidden="true">
          chevron_right
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[#f7f7f9] px-4 py-3.5">
        <div>
          <div className="text-[12px] font-semibold text-[#5e5e63]">
            {last ? `Buổi gần nhất · ${shortDay(last.day)}` : "Buổi gần nhất"}
          </div>
          {last?.average != null ? (
            <div className="mt-1 flex items-center gap-1.5 font-[family-name:var(--font-plus-jakarta-sans)] text-[24px] font-extrabold tabular-nums">
              <Star size={22} />
              {last.average.toLocaleString("vi")}
            </div>
          ) : (
            <div className="mt-1.5 text-[13px] leading-[18px] text-[#5e5e63]">
              {last ? "Chưa đủ 3 đánh giá" : "Chưa có buổi học"}
            </div>
          )}
        </div>
        <div>
          <div className="text-[12px] font-semibold text-[#5e5e63]">Đã đánh giá</div>
          <div className="mt-1 font-[family-name:var(--font-plus-jakarta-sans)] text-[24px] font-extrabold tabular-nums">
            {last ? last.ratedCount : "—"}
            <span className="text-[15px] font-semibold text-[#5e5e63]">/{data.students.length}</span>
          </div>
        </div>
      </div>

      {behind > 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-[#fff1ef] px-3 py-2.5 text-[14px] font-semibold text-[#93000a]">
          <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#e0352b]" />
          {behind} học viên đang chậm tiến độ
        </p>
      ) : data.students.length > 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-[#eaf7ee] px-3 py-2.5 text-[14px] font-semibold text-[#1b6b34]">
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            check
          </span>
          Cả lớp đang đúng tiến độ
        </p>
      ) : null}
    </Link>
  );
}
