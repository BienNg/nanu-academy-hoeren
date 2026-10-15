import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityChart, TeacherLogin } from "@/components/teacher/TeacherClient";
import {
  Avatar,
  BackLink,
  CARD,
  H2,
  StatCard,
  Stars,
  classHref,
  decodeSegment,
  reasonLabel,
  seenLabel,
  shortDay,
  viDay,
} from "@/components/teacher/TeacherUi";
import { loadClassPage } from "@/components/teacher/loadClass";
import { PARTS_PER_DAY_TARGET, RATING_TAG_LABEL } from "@/lib/session-ratings";
import { readTeacherStudentRatings } from "@/lib/teacher-store";

function ProgressRow({ label, done, total, note }: { label: string; done: number; total: number; note?: string }) {
  const share = total > 0 ? done / total : 0;
  return (
    <div>
      <div className="flex justify-between gap-3 text-[14px]">
        <span className="font-semibold">{label}</span>
        <span className="text-[#414753] tabular-nums">
          <strong>
            {done}/{total}
          </strong>
          {note ? ` ${note}` : ""}
        </span>
      </div>
      <div className="mt-2 h-2.5 rounded-full bg-[#f0edef]">
        <div className="h-2.5 rounded-full bg-[#0071e3]" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
    </div>
  );
}

/** T5: one student's activity, progress and session ratings. Read-only. */
export default async function StudentPage({ params }: { params: Promise<{ classKey: string; userId: string }> }) {
  const { classKey, userId } = await params;
  const page = await loadClassPage(classKey);
  if (page.kind === "denied") return <TeacherLogin denied email={page.email} base={page.base} />;
  const { data, base } = page;
  const student = data.students.find((entry) => entry.userId === decodeSegment(userId));
  if (!student) notFound();
  const ratings = (await readTeacherStudentRatings(data.key, student.userId)) ?? [];
  const ratingByDay = new Map(ratings.map((rating) => [rating.day, rating]));
  const gap = student.lektion !== null && data.classLektion !== null ? student.lektion - data.classLektion : null;
  const behind = student.reasons.length > 0;
  const rated = data.sessions.filter((session) => ratingByDay.has(session.day));
  const ratedAverage = rated.length
    ? Math.round((rated.reduce((sum, session) => sum + (ratingByDay.get(session.day)?.stars ?? 0), 0) / rated.length) * 10) / 10
    : null;

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 pt-4 pb-12 sm:px-6">
      <BackLink href={classHref(base, data.key, "/students")}>{data.name} · Học viên</BackLink>

      <section className={`${CARD} flex flex-wrap items-center gap-5 p-6`}>
        <Avatar name={student.name} image={student.image} size={72} />
        <div className="min-w-0 flex-[1_1_260px]">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-[family-name:var(--font-plus-jakarta-sans)] text-[28px] leading-9 font-extrabold tracking-[-0.02em]">
              {student.name}
            </h1>
            {behind ? (
              <span className="flex h-[26px] items-center gap-1.5 rounded-full bg-[#ffecea] px-2.5 text-[13px] font-bold text-[#a3150c]">
                <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-[#e0352b]" />
                Chậm tiến độ
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[14px] text-[#5e5e63]">
            {[data.name, data.levelLabel].filter(Boolean).join(" · ")}
            {behind
              ? ` · ${student.reasons.map((reason) => reasonLabel(reason, gap === null ? null : -gap, student.daysSinceSeen)).join(", ")}`
              : ""}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="XP tuần này" value={student.weekXp} sub={`· hạng ${student.rank}/${data.students.length}`} />
        <StatCard
          label="Phần/ngày · 7 ngày"
          value={student.pace.toLocaleString("vi", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          sub={`mục tiêu ${PARTS_PER_DAY_TARGET}`}
          tone={student.tier === "low" ? "danger" : undefined}
        />
        <StatCard
          label="Đang học"
          value={student.lektion !== null ? `Lektion ${student.lektion}` : "—"}
          sub={data.classLektion !== null ? `lớp: ${data.classLektion}` : undefined}
        />
        <StatCard label="Hoạt động gần nhất" value={seenLabel(student.daysSinceSeen)} />
      </div>

      <section aria-labelledby="act-h" className={`${CARD} p-6`}>
        <h2 id="act-h" className={H2}>
          Hoạt động 30 ngày
        </h2>
        <p className="mt-0.5 text-[13px] text-[#5e5e63]">Số phần học và luyện tập hoàn thành mỗi ngày</p>
        <div className="mt-3">
          <ActivityChart
            target={PARTS_PER_DAY_TARGET}
            points={student.daily.map((entry) => ({ day: entry.day, label: shortDay(entry.day), parts: entry.parts }))}
          />
        </div>
      </section>

      <section aria-labelledby="prog-h" className={`${CARD} flex flex-col gap-4 p-6`}>
        <h2 id="prog-h" className={H2}>
          Tiến độ {data.levelLabel ?? ""}
        </h2>
        <ProgressRow label="Lektion hoàn thành" done={student.lessonsDone} total={student.lessonsTotal} />
        {student.videosTotal > 0 ? (
          <ProgressRow label="Video đã xem" done={student.videosWatched} total={student.videosTotal} note={`· tuần này ${student.videosThisWeek}`} />
        ) : null}
      </section>

      <section aria-labelledby="ratings-h" className={`${CARD} overflow-hidden`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-6 pt-5 pb-3">
          <h2 id="ratings-h" className={H2}>
            Đánh giá của học viên
          </h2>
          <span className="text-[13px] text-[#5e5e63]">
            Đã đánh giá{" "}
            <strong className="text-[#1b1b1d]">
              {rated.length}/{data.sessions.length}
            </strong>{" "}
            buổi{ratedAverage !== null ? ` · trung bình ${ratedAverage.toLocaleString("vi")}` : ""}
          </span>
        </div>
        {data.sessions.length === 0 ? (
          <p className="px-6 pb-6 text-[14px] text-[#5e5e63]">Chưa có buổi học nào.</p>
        ) : (
          <ul>
            {data.sessions.map((session) => {
              const rating = ratingByDay.get(session.day);
              return (
                <li key={session.day} className="border-t border-[#f0edef]">
                  <Link
                    href={classHref(base, data.key, `/sessions/${session.day}`)}
                    className="flex flex-wrap items-start gap-x-5 gap-y-2 px-6 py-3.5 hover:bg-[#f7f9fd]"
                  >
                    <span className="w-[170px] shrink-0">
                      <span className="block text-[15px] font-semibold">{viDay(session.day)}</span>
                      <span className="block text-[13px] text-[#6e6e73]">Lektion {session.lektion}</span>
                    </span>
                    {rating ? (
                      <span className="min-w-0 flex-[1_1_320px]">
                        <Stars value={rating.stars} size={16} />
                        {rating.tags.length > 0 ? (
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            {rating.tags.map((tag) => (
                              <span key={tag} className="flex h-6 items-center rounded-full bg-[#f0edef] px-2.5 text-[12px] font-semibold text-[#414753]">
                                {RATING_TAG_LABEL[tag]}
                              </span>
                            ))}
                          </span>
                        ) : null}
                        {rating.comment ? <span className="mt-1.5 block text-[15px] leading-[23px]">{rating.comment}</span> : null}
                      </span>
                    ) : (
                      <span className="flex-[1_1_320px] text-[14px] text-[#6e6e73]">Không đánh giá</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
