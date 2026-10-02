import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { TopBarStatus } from "@/components/TodayXpChip";
import {
  BOX_INTERVAL_DAYS,
  daysBetween,
  intervalLabel,
  LEITNER_SCHEMA_HINT,
  REVIEW_ROUND_CLIPS,
} from "@/lib/leitner";
import type { ReviewOverview } from "@/lib/leitner-store";

type ReviewHomeScreenProps = {
  overview: ReviewOverview;
  isAdmin: boolean;
};

function Icon({ name, className, filled = false }: { name: string; className?: string; filled?: boolean }) {
  return (
    <span
      className={`material-symbols-outlined ${className ?? ""}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function shortDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${Number(date)}/${Number(month)}`;
}

function nextDueText(overview: ReviewOverview): string {
  if (overview.dueTomorrow > 0) return `Ngày mai có ${overview.dueTomorrow} câu.`;
  if (!overview.nextDueOn) return "";
  const days = daysBetween(overview.today, overview.nextDueOn);
  return `Lần ôn tới: ${shortDay(overview.nextDueOn)} (sau ${days} ngày).`;
}

function TodayCard({ overview }: { overview: ReviewOverview }) {
  const empty = overview.total === 0;
  const roundSize = Math.min(overview.due, REVIEW_ROUND_CLIPS);
  return (
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#0284c7] to-[#0ea5e9] p-5 text-white shadow-[0_6px_0_0_#0369a1]">
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-sky-100">Hôm nay</p>
          {empty ? (
            <p className="mt-1 text-[22px] font-extrabold leading-tight">Chưa có câu nào trong hộp</p>
          ) : overview.due > 0 ? (
            <>
              <p className="mt-1 text-[40px] font-extrabold leading-none tabular-nums">{overview.due}</p>
              <p className="mt-1 text-[14px] font-bold">câu cần ôn</p>
            </>
          ) : (
            <p className="mt-1 text-[22px] font-extrabold leading-tight">Đã ôn xong</p>
          )}
        </div>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 shadow-[0_3px_0_0_rgba(3,105,161,0.45)]">
          <Icon name={overview.due > 0 || empty ? "event_repeat" : "task_alt"} className="text-[32px] text-[#ffd60a]" filled />
        </div>
      </div>
      <p className="relative z-10 mt-3 text-[13px] font-semibold text-sky-50">
        {empty
          ? "Hoàn thành một phần luyện tập trong bài học. Câu đúng vào hộp 1, câu sai vào hộp 0."
          : overview.due > 0
            ? "Câu hay sai nhất được hỏi trước. Mỗi câu có hai thẻ: chọn nghĩa, rồi gõ lại tiếng Đức."
            : nextDueText(overview)}
      </p>
      {empty ? (
        <Link
          href="/"
          className="relative z-10 mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[16px] font-extrabold text-[#0369a1] shadow-[0_4px_0_0_#bae6fd] transition-transform active:translate-y-0.5"
        >
          Đến bài học
          <Icon name="arrow_forward" className="text-[20px]" />
        </Link>
      ) : overview.due > 0 ? (
        <Link
          href="/review/session"
          className="relative z-10 mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-[16px] font-extrabold text-[#0369a1] shadow-[0_4px_0_0_#bae6fd] transition-transform active:translate-y-0.5"
        >
          Bắt đầu ôn · {roundSize} câu
          <Icon name="arrow_forward" className="text-[20px]" />
        </Link>
      ) : null}
      <Icon
        name="event_repeat"
        className="pointer-events-none absolute -right-3 -bottom-6 text-[120px] text-white/15"
      />
    </section>
  );
}

function BoxChart({ overview }: { overview: ReviewOverview }) {
  const most = Math.max(1, ...overview.boxCounts);
  return (
    <section className="rounded-[28px] bg-white p-5 shadow-[0_4px_0_0_#dae2fd]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[16px] font-extrabold text-[#131b2e]">7 hộp của bạn</h2>
        <p className="text-[13px] font-bold tabular-nums text-[#6e7881]">{overview.total} câu</p>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-3" aria-label="Số câu trong mỗi hộp">
        {BOX_INTERVAL_DAYS.map((days, box) => {
          const count = overview.boxCounts[box] ?? 0;
          const height = count === 0 ? 4 : Math.max(10, Math.round((count / most) * 96));
          return (
            <li key={box} className="flex min-w-0 flex-col items-center gap-1" aria-label={`Hộp ${box}: ${count} câu, gặp lại sau ${intervalLabel(days)}`}>
              <span className="text-[13px] font-extrabold tabular-nums text-[#131b2e]">{count}</span>
              <span className="flex h-24 w-full items-end justify-center">
                <span
                  className={`w-full max-w-10 rounded-t-lg ${box === 0 ? "bg-[#fb923c]" : box === 6 ? "bg-[#0f766e]" : "bg-[#38bdf8]"}`}
                  style={{ height }}
                />
              </span>
              <span className="text-[12px] font-extrabold text-[#131b2e]">{box}</span>
              <span className="text-center text-[10px] font-bold leading-tight text-[#6e7881]">
                {intervalLabel(days)}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[12px] font-semibold text-[#6e7881]">
        Số dưới mỗi cột là thời gian chờ trước khi câu quay lại.
      </p>
    </section>
  );
}

const RULES = [
  {
    icon: "flag",
    title: "Lần đầu luyện",
    text: `Câu đúng ngay lần đầu vào hộp 1 và quay lại sau ${intervalLabel(BOX_INTERVAL_DAYS[1])}. Câu sai vào hộp 0 và quay lại ngày mai.`,
  },
  {
    icon: "trending_up",
    title: "Đúng khi đến hạn",
    text: "Câu lên một hộp, nên thời gian chờ dài dần. Câu đã thuộc sẽ ít gặp lại.",
  },
  {
    icon: "restart_alt",
    title: "Sai bất kỳ lúc nào",
    text: "Câu về hộp 0 và quay lại ngày mai, dù đang ở hộp nào. Câu sai nhiều lần được hỏi trước.",
  },
  {
    icon: "hourglass_empty",
    title: "Đúng trước hạn",
    text: "Luyện lại bài và trả lời đúng trước ngày hẹn thì hộp không đổi. Chỉ lần ôn đúng hạn mới được lên hộp.",
  },
] as const;

function HowItWorks() {
  return (
    <details className="group rounded-[28px] bg-white shadow-[0_4px_0_0_#dae2fd]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-[16px] font-extrabold text-[#131b2e] [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Icon name="lightbulb" className="text-[22px] text-[#0284c7]" />
          Cách hoạt động
        </span>
        <Icon name="expand_more" className="text-[24px] text-[#6e7881] transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-3 px-5 pb-5">
        <ul className="flex flex-col gap-3">
          {RULES.map((rule) => (
            <li key={rule.title} className="flex gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e0f2fe] text-[#0284c7]">
                <Icon name={rule.icon} className="text-[20px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-[14px] font-extrabold text-[#131b2e]">{rule.title}</span>
                <span className="block text-[13px] font-medium leading-relaxed text-[#6e7881]">{rule.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="rounded-2xl bg-[#f1f5ff] px-3 py-2 text-[12px] font-semibold leading-relaxed text-[#3e4850]">
          Một câu tính là sai nếu bạn sai bất kỳ thẻ nào của câu đó. Câu đến hạn sẵn sàng từ 0 giờ (giờ Việt Nam).
          Hộp {BOX_INTERVAL_DAYS.length - 1} là hộp cao nhất: câu ở đó quay lại sau{" "}
          {intervalLabel(BOX_INTERVAL_DAYS[BOX_INTERVAL_DAYS.length - 1])}.
        </p>
      </div>
    </details>
  );
}

export function ReviewHomeScreen({ overview, isAdmin }: ReviewHomeScreenProps) {
  return (
    <div
      data-layout="wide"
      className="relative flex min-h-dvh w-screen max-w-none flex-1 flex-col bg-[#faf8ff] text-[#131b2e]"
    >
      <header className="sticky top-0 z-30 border-b border-black/[0.04] bg-[#faf8ff]/90 pt-safe backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 pb-2.5 pt-3 sm:px-6">
          <h1 className="min-w-0 font-headline-md text-headline-md font-extrabold tracking-tight text-[#131b2e]">
            Ôn tập
          </h1>
          <TopBarStatus />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6">
        {overview.status !== "ready" ? (
          <section className="rounded-[28px] bg-white px-5 py-8 text-center shadow-[0_4px_0_0_#dae2fd]">
            <p className="text-[16px] font-extrabold text-[#131b2e]">
              {overview.status === "missing" ? "Ôn tập chưa được bật" : "Không tải được hộp ôn tập"}
            </p>
            <p className="mt-2 text-[14px] font-medium leading-relaxed text-[#6e7881]">
              {overview.status === "missing"
                ? isAdmin
                  ? LEITNER_SCHEMA_HINT
                  : "Mục này sẽ hiện sau khi giáo viên bật tính năng ôn tập."
                : "Vui lòng thử lại sau."}
            </p>
          </section>
        ) : (
          <>
            <TodayCard overview={overview} />
            {overview.total > 0 ? <BoxChart overview={overview} /> : null}
            <HowItWorks />
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
