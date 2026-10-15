import Link from "next/link";
import { notFound } from "next/navigation";
import { RatingPingu } from "@/components/session/Pingu";
import { TeacherLogin } from "@/components/teacher/TeacherClient";
import {
  Avatar,
  BackLink,
  CARD,
  CountBars,
  H2,
  StatCard,
  Stars,
  TagLegend,
  classHref,
  tagRows,
  viDay,
} from "@/components/teacher/TeacherUi";
import { loadClassPage } from "@/components/teacher/loadClass";
import { isScheduleDay } from "@/lib/class-schedule";
import { RATING_TAG_LABEL } from "@/lib/session-ratings";
import { readTeacherSessionRatings } from "@/lib/teacher-store";

/** "14.10, 21:10" in Vietnam time. */
function timeLabel(iso: string): string {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}, ${part("hour")}:${part("minute")}`;
}

/** T3: one session's ratings, with names. */
export default async function SessionPage({ params }: { params: Promise<{ classKey: string; date: string }> }) {
  const { classKey, date } = await params;
  const page = await loadClassPage(classKey);
  if (page.kind === "denied") return <TeacherLogin denied email={page.email} />;
  const { data } = page;
  if (!isScheduleDay(date)) notFound();
  const session = data.sessions.find((entry) => entry.day === date);
  if (!session) notFound();
  const ratings = (await readTeacherSessionRatings(data.key, date)) ?? [];
  const commentCount = ratings.filter((rating) => rating.comment).length;
  const enough = session.average != null;
  const studentCount = data.students.length;

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 pt-4 pb-12 sm:px-6">
      <BackLink href={classHref(data.key)}>{data.name} · Phản hồi</BackLink>
      <div>
        <p className="text-[14px] text-[#5e5e63]">
          {data.levelLabel ? `${data.levelLabel} · ` : ""}Lektion {session.lektion}
        </p>
        <h1 className="mt-0.5 font-[family-name:var(--font-plus-jakarta-sans)] text-[28px] leading-9 font-extrabold tracking-[-0.02em]">
          {viDay(session.day)}
        </h1>
      </div>

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <StatCard
          label="Điểm trung bình"
          value={enough ? <span className="inline-flex items-center gap-2">{session.average?.toLocaleString("vi")}</span> : "—"}
          sub={enough && session.average != null ? <Stars value={session.average} size={18} /> : undefined}
        />
        <StatCard
          label="Đã đánh giá"
          value={`${session.ratedCount}/${studentCount}`}
          sub={studentCount > 0 ? `${Math.round((session.ratedCount / studentCount) * 100)}%` : undefined}
        />
        <StatCard label="Bình luận" value={commentCount} />
      </div>

      {!enough && session.ratedCount > 0 ? (
        <div role="status" className="flex items-center gap-4 rounded-[20px] border border-dashed border-[#c1c6d6] bg-white px-5 py-4">
          <RatingPingu mood={3} size={60} />
          <div>
            <p className="font-[family-name:var(--font-plus-jakarta-sans)] text-[17px] font-extrabold">
              Chưa đủ đánh giá để hiển thị kết quả
            </p>
            <p className="mt-1 text-[14px] leading-[21px] text-[#414753]">
              Cần ít nhất 3 đánh giá thì điểm trung bình mới phản ánh được cả lớp. Từng đánh giá vẫn hiện bên dưới.
            </p>
          </div>
        </div>
      ) : null}

      {enough && session.starCounts && session.tagCounts ? (
        <div className="flex flex-wrap gap-5">
          <section aria-labelledby="dist-h" className={`${CARD} min-w-0 flex-[1_1_320px] p-6`}>
            <h2 id="dist-h" className={`${H2} mb-4`}>
              Phân bố sao
            </h2>
            <CountBars rows={[5, 4, 3, 2, 1].map((stars) => ({ key: String(stars), label: `${stars}★`, count: session.starCounts?.[stars - 1] ?? 0 }))} />
          </section>
          <section aria-labelledby="alltags-h" className={`${CARD} min-w-0 flex-[1_1_320px] p-6`}>
            <h2 id="alltags-h" className={`${H2} mb-4`}>
              Tất cả nhận xét
            </h2>
            {tagRows(session.tagCounts).length > 0 ? (
              <>
                <CountBars rows={tagRows(session.tagCounts)} />
                <TagLegend />
              </>
            ) : (
              <p className="text-[14px] text-[#5e5e63]">Chưa có nhận xét.</p>
            )}
          </section>
        </div>
      ) : null}

      <section aria-labelledby="ratings-h" className={`${CARD} p-6`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="ratings-h" className={H2}>
            Đánh giá của học viên
          </h2>
          <span className="text-[13px] text-[#5e5e63]">Mới nhất trước</span>
        </div>
        {ratings.length === 0 ? (
          <div className="mt-4 flex flex-col items-center py-6 text-center">
            <RatingPingu mood={0} size={80} />
            <p className="mt-3 font-[family-name:var(--font-plus-jakarta-sans)] text-[17px] font-extrabold">Chưa có đánh giá</p>
          </div>
        ) : (
          <ul className="mt-3">
            {ratings.map((rating) => (
              <li key={rating.userId} className="flex gap-3.5 border-t border-[#f0edef] py-4 first:border-t-0">
                <Avatar name={rating.name} image={rating.image} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <Link
                      href={classHref(data.key, `/students/${encodeURIComponent(rating.userId)}`)}
                      className="text-[15px] font-bold hover:text-[#0059b5]"
                    >
                      {rating.name}
                    </Link>
                    <Stars value={rating.stars} size={15} />
                    <span className="text-[12px] text-[#6e6e73]">{timeLabel(rating.createdAt)}</span>
                  </div>
                  {rating.tags.length > 0 ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {rating.tags.map((tag) => (
                        <span key={tag} className="flex h-6 items-center rounded-full bg-[#f0edef] px-2.5 text-[12px] font-semibold text-[#414753]">
                          {RATING_TAG_LABEL[tag]}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {rating.comment ? <p className="mt-1.5 text-[15px] leading-[23px] whitespace-pre-line">{rating.comment}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
