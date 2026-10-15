import Link from "next/link";
import { RatingPingu } from "@/components/session/Pingu";
import { ClassHeader } from "@/components/teacher/ClassHeader";
import { TeacherLogin, TrendChart } from "@/components/teacher/TeacherClient";
import { CARD, CountBars, EmptyState, H2, Stars, TagLegend, classHref, shortDay, tagRows, viDay } from "@/components/teacher/TeacherUi";
import { loadClassPage } from "@/components/teacher/loadClass";

/** T2: how the class's sessions were received. */
export default async function ClassFeedbackPage({ params }: { params: Promise<{ classKey: string }> }) {
  const page = await loadClassPage((await params).classKey);
  if (page.kind === "denied") return <TeacherLogin denied email={page.email} />;
  const { data } = page;
  const last = data.sessions[0] ?? null;
  const studentCount = data.students.length;

  return (
    <>
      <ClassHeader access={page.access} data={data} tab="feedback" />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 pt-7 pb-12 sm:px-6">
        {!last ? (
          <EmptyState
            icon={<RatingPingu mood={0} size={110} />}
            title="Chưa có buổi học nào"
            text={
              data.scheduleLine
                ? "Đánh giá sẽ hiện ở đây sau buổi học đầu tiên."
                : "Lớp này chưa có lịch học. Khi quản trị thêm lịch, các buổi học và đánh giá sẽ hiện ở đây."
            }
          />
        ) : (
          <>
            <section aria-labelledby="last-h" className={`${CARD} flex flex-wrap gap-8 p-6`}>
              <div className="min-w-0 flex-[1_1_280px]">
                <h2 id="last-h" className="text-[13px] font-bold tracking-[0.06em] text-[#5e5e63] uppercase">
                  Buổi gần nhất
                </h2>
                <p className="mt-1.5 font-[family-name:var(--font-plus-jakarta-sans)] text-[20px] font-extrabold">
                  {viDay(last.day)} · Lektion {last.lektion}
                </p>
                <div className="mt-4 flex items-end gap-3.5">
                  <span className="font-[family-name:var(--font-plus-jakarta-sans)] text-[56px] leading-[56px] font-extrabold tracking-[-0.03em] tabular-nums">
                    {last.average != null ? last.average.toLocaleString("vi") : "—"}
                  </span>
                  <div className="pb-1.5">
                    {last.average != null ? <Stars value={last.average} size={22} /> : null}
                    <p className="mt-1 text-[14px] text-[#5e5e63]">
                      <strong className="text-[#1b1b1d]">
                        {last.ratedCount}/{studentCount}
                      </strong>{" "}
                      học viên đã đánh giá
                    </p>
                  </div>
                </div>
                <Link
                  href={classHref(data.key, `/sessions/${last.day}`)}
                  className="mt-5 inline-flex min-h-11 items-center gap-1 text-[14px] font-bold text-[#0059b5] hover:text-[#004c99]"
                >
                  Xem chi tiết và đánh giá
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    chevron_right
                  </span>
                </Link>
              </div>
              <div className="flex min-w-0 flex-[1_1_300px] flex-col justify-center">
                {last.starCounts ? (
                  <CountBars
                    rows={[5, 4, 3, 2, 1].map((stars) => ({ key: String(stars), label: `${stars}★`, count: last.starCounts?.[stars - 1] ?? 0 }))}
                  />
                ) : (
                  <p className="rounded-2xl border border-dashed border-[#c1c6d6] px-4 py-5 text-[14px] leading-[21px] text-[#5e5e63]">
                    {last.ratedCount === 0 ? "Chưa có đánh giá cho buổi này." : "Chưa đủ 3 đánh giá để hiển thị kết quả."}
                  </p>
                )}
              </div>
            </section>

            <div className="flex flex-wrap gap-5">
              <section aria-labelledby="trend-h" className={`${CARD} min-w-0 flex-[999_1_560px] p-6`}>
                <h2 id="trend-h" className={H2}>
                  Điểm trung bình theo buổi
                </h2>
                <p className="mt-0.5 text-[13px] text-[#5e5e63]">Buổi dưới 3 đánh giá để trống.</p>
                <div className="mt-3">
                  <TrendChart
                    points={[...data.sessions].reverse().map((session) => ({
                      label: shortDay(session.day),
                      lektion: `Lektion ${session.lektion}`,
                      average: session.average,
                      rated: session.ratedCount,
                    }))}
                  />
                </div>
              </section>
              <section aria-labelledby="tags-h" className={`${CARD} min-w-0 flex-[1_1_320px] p-6`}>
                <h2 id="tags-h" className={H2}>
                  Nhận xét nhiều nhất
                </h2>
                <p className="mt-0.5 text-[13px] text-[#5e5e63]">Buổi {shortDay(last.day)}</p>
                {last.tagCounts && tagRows(last.tagCounts).length > 0 ? (
                  <div className="mt-4">
                    <CountBars rows={tagRows(last.tagCounts).slice(0, 6)} />
                    <TagLegend />
                  </div>
                ) : (
                  <p className="mt-4 text-[14px] text-[#5e5e63]">
                    {last.tagCounts ? "Chưa có nhận xét." : "Hiện khi buổi học có từ 3 đánh giá."}
                  </p>
                )}
              </section>
            </div>

            <section aria-labelledby="sessions-h" className={`${CARD} overflow-hidden`}>
              <h2 id="sessions-h" className={`${H2} px-6 pt-5 pb-3`}>
                Tất cả buổi học
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-[15px]">
                  <thead className="bg-[#f7f7f9] text-[12px] font-bold tracking-[0.04em] text-[#5e5e63] uppercase">
                    <tr>
                      <th scope="col" className="px-6 py-2.5 font-bold">Ngày</th>
                      <th scope="col" className="px-3 py-2.5 font-bold">Lektion</th>
                      <th scope="col" className="px-3 py-2.5 font-bold">Điểm TB</th>
                      <th scope="col" className="px-6 py-2.5 font-bold">Đã đánh giá</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessions.map((session) => (
                      <tr key={session.day} className="border-t border-[#f0edef] hover:bg-[#f7f9fd]">
                        <td className="px-6 py-3 font-semibold">
                          <Link href={classHref(data.key, `/sessions/${session.day}`)} className="hover:text-[#0059b5]">
                            {viDay(session.day)}
                          </Link>
                        </td>
                        <td className="px-3 py-3">Lektion {session.lektion}</td>
                        <td className="px-3 py-3">
                          {session.average != null ? (
                            <span className="inline-flex items-center gap-1.5 font-extrabold tabular-nums">★ {session.average.toLocaleString("vi")}</span>
                          ) : (
                            <span className="text-[13px] text-[#6e6e73]">{session.ratedCount === 0 ? "Chưa có đánh giá" : "Chưa đủ đánh giá"}</span>
                          )}
                        </td>
                        <td className="px-6 py-3 tabular-nums">
                          {session.ratedCount}/{studentCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
