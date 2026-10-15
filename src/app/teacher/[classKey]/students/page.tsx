import Link from "next/link";
import { RatingPingu } from "@/components/session/Pingu";
import { ClassHeader } from "@/components/teacher/ClassHeader";
import { TeacherLogin } from "@/components/teacher/TeacherClient";
import {
  Avatar,
  BehindDot,
  CARD,
  EmptyState,
  H2,
  PaceChip,
  StatCard,
  classHref,
  reasonLabel,
  seenLabel,
} from "@/components/teacher/TeacherUi";
import { loadClassPage } from "@/components/teacher/loadClass";
import { PARTS_PER_DAY_TARGET } from "@/lib/session-ratings";
import type { TeacherStudent } from "@/lib/teacher-store";

const SORTS = {
  attention: "Cần chú ý trước",
  xp: "XP tuần",
  pace: "Phần/ngày",
  name: "Tên",
} as const;
type SortKey = keyof typeof SORTS;

function sortStudents(students: readonly TeacherStudent[], sort: SortKey): TeacherStudent[] {
  const lastName = (name: string) => name.trim().split(/\s+/).at(-1) ?? name;
  const order: Record<SortKey, (a: TeacherStudent, b: TeacherStudent) => number> = {
    // The store already lists behind students first, slowest first.
    attention: () => 0,
    xp: (a, b) => b.weekXp - a.weekXp,
    pace: (a, b) => b.pace - a.pace,
    name: (a, b) => lastName(a.name).localeCompare(lastName(b.name), "vi"),
  };
  return [...students].sort(order[sort]);
}

/** T4: every student of the class, behind first. Filter and sort are links, so the page stays server-rendered. */
export default async function StudentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classKey: string }>;
  searchParams: Promise<{ behind?: string; sort?: string }>;
}) {
  const page = await loadClassPage((await params).classKey);
  if (page.kind === "denied") return <TeacherLogin denied email={page.email} base={page.base} />;
  const { data, base } = page;
  const query = await searchParams;
  const onlyBehind = query.behind === "1";
  const sort: SortKey = query.sort && query.sort in SORTS ? (query.sort as SortKey) : "attention";
  const behind = data.students.filter((student) => student.reasons.length > 0);
  const shown = sortStudents(onlyBehind ? behind : data.students, sort);
  const average = data.students.length
    ? Math.round((data.students.reduce((sum, student) => sum + student.pace, 0) / data.students.length) * 10) / 10
    : 0;
  const href = (next: { behind?: boolean; sort?: SortKey }) => {
    const params = new URLSearchParams();
    if (next.behind ?? onlyBehind) params.set("behind", "1");
    const nextSort = next.sort ?? sort;
    if (nextSort !== "attention") params.set("sort", nextSort);
    const search = params.toString();
    return classHref(base, data.key, `/students${search ? `?${search}` : ""}`);
  };

  return (
    <>
      <ClassHeader access={page.access} data={data} tab="students" />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 pt-7 pb-12 sm:px-6">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatCard label="Chậm tiến độ" value={behind.length} sub={`/ ${data.students.length}`} tone={behind.length > 0 ? "danger" : undefined} />
          <StatCard label="Lớp đang học" value={data.classLektion ? `Lektion ${data.classLektion}` : "—"} />
          <StatCard
            label="Phần/ngày, trung bình lớp"
            value={average.toLocaleString("vi", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            sub={`mục tiêu ${PARTS_PER_DAY_TARGET}`}
          />
          <StatCard label="Hoạt động hôm nay" value={data.students.filter((student) => student.daysSinceSeen === 0).length} sub="học viên" />
        </div>

        <section aria-labelledby="list-h" className={`${CARD} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            <h2 id="list-h" className={H2}>
              Học viên
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={href({ behind: !onlyBehind })}
                aria-pressed={onlyBehind}
                className={`flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-[14px] font-semibold ${
                  onlyBehind ? "border-[#0066cc] bg-[#e8f2ff] text-[#0059b5]" : "border-[#d1d1d6] text-[#1b1b1d] hover:bg-[#f7f7f9]"
                }`}
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  {onlyBehind ? "check_box" : "check_box_outline_blank"}
                </span>
                Chỉ hiện học viên chậm tiến độ
              </Link>
              <nav aria-label="Sắp xếp" className="flex flex-wrap items-center gap-1 text-[13px]">
                <span className="mr-1 text-[#5e5e63]">Sắp xếp:</span>
                {(Object.keys(SORTS) as SortKey[]).map((key) => (
                  <Link
                    key={key}
                    href={href({ sort: key })}
                    aria-current={sort === key ? "true" : undefined}
                    className={`flex min-h-9 items-center rounded-full px-3 font-semibold ${
                      sort === key ? "bg-[#1b1b1d] text-white" : "text-[#414753] hover:bg-[#f0edef]"
                    }`}
                  >
                    {SORTS[key]}
                  </Link>
                ))}
              </nav>
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="px-6 pb-6">
              {onlyBehind && data.students.length > 0 ? (
                <EmptyState
                  tone="good"
                  icon={<RatingPingu mood={5} size={110} />}
                  title="Không ai bị bỏ lại phía sau!"
                  text={`Cả ${data.students.length} học viên đều đang theo kịp lớp.`}
                />
              ) : (
                <p className="py-6 text-center text-[14px] text-[#5e5e63]">Lớp chưa có học viên.</p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-[15px]">
                <thead className="bg-[#f7f7f9] text-[12px] tracking-[0.04em] text-[#5e5e63] uppercase">
                  <tr>
                    <th scope="col" className="px-6 py-2.5 font-bold">Học viên</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">XP tuần</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Phần/ngày · 7 ngày</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Lektion</th>
                    <th scope="col" className="px-3 py-2.5 font-bold">Hoạt động</th>
                    <th scope="col" className="px-6 py-2.5 font-bold">Video tuần</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((student) => {
                    const gap = student.lektion !== null && data.classLektion !== null ? student.lektion - data.classLektion : null;
                    return (
                      <tr key={student.userId} className="border-t border-[#f0edef] hover:bg-[#f7f9fd]">
                        <td className="px-6 py-3">
                          <Link
                            href={classHref(base, data.key, `/students/${encodeURIComponent(student.userId)}`)}
                            className="flex items-center gap-2.5"
                          >
                            <span className="flex w-2.5 justify-center">{student.reasons.length > 0 ? <BehindDot /> : null}</span>
                            <Avatar name={student.name} image={student.image} />
                            <span className="min-w-0">
                              <span className="block font-semibold hover:text-[#0059b5]">{student.name}</span>
                              {student.reasons.length > 0 ? (
                                <span className="block text-[12px] font-semibold text-[#c4261d]">
                                  <span className="sr-only">Chậm tiến độ: </span>
                                  {student.reasons.map((reason) => reasonLabel(reason, gap === null ? null : -gap, student.daysSinceSeen)).join(" · ")}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          <strong>{student.weekXp}</strong> <span className="text-[13px] text-[#6e6e73]">#{student.rank}</span>
                        </td>
                        <td className="px-3 py-3">
                          <PaceChip pace={student.pace} tier={student.tier} />
                        </td>
                        <td className="px-3 py-3">
                          <span className="flex items-center gap-2">
                            <span className="font-semibold">{student.lektion !== null ? `L${student.lektion}` : "—"}</span>
                            {gap !== null && gap < 0 ? (
                              <span className="flex h-[22px] items-center rounded-full bg-[#ffecea] px-2 text-[12px] font-bold text-[#a3150c]">
                                {gap} so với lớp
                              </span>
                            ) : gap !== null && gap > 0 ? (
                              <span className="flex h-[22px] items-center rounded-full bg-[#eaf7ee] px-2 text-[12px] font-bold text-[#1b6b34]">+{gap}</span>
                            ) : null}
                          </span>
                        </td>
                        <td className={`px-3 py-3 ${student.daysSinceSeen === null || student.daysSinceSeen >= 3 ? "font-semibold text-[#a3150c]" : ""}`}>
                          {seenLabel(student.daysSinceSeen)}
                        </td>
                        <td className="px-6 py-3 tabular-nums">{student.videosThisWeek}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
