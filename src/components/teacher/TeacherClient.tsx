"use client";

import { signIn, signOut } from "next-auth/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RatingPingu } from "@/components/session/Pingu";
import { FOCUS_RING } from "@/lib/keyboard";

const AXIS = { fontSize: 12, fill: "#6e6e73" };
const GRID = "#ecebef";
const BLUE = "#0071e3";
const BLUE_LIGHT = "#9cc3f2";

/** T0: Google sign-in, or the "no teacher role" note with a way to switch accounts. */
export function TeacherLogin({ denied, email }: { denied: boolean; email?: string | null }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f4f6fb] px-4 py-12">
      <div className="flex w-full max-w-[420px] flex-col items-center rounded-[28px] border border-[#e5e5ea] bg-white px-8 pt-10 pb-8 text-center shadow-[0_12px_40px_rgba(17,24,39,0.06)]">
        <RatingPingu mood={4} size={112} />
        <div className="mt-4 flex items-center gap-2.5">
          <span className="font-[family-name:var(--font-plus-jakarta-sans)] text-[26px] font-extrabold tracking-[-0.02em] text-[#1b1b1d]">
            NaNu Go
          </span>
          <span className="flex h-[26px] items-center rounded-full bg-[#e8f2ff] px-2.5 text-[13px] font-bold text-[#0059b5]">
            Giáo viên
          </span>
        </div>
        <p className="mt-2.5 text-[15px] leading-[22px] text-[#5e5e63]">
          Xem phản hồi về buổi học và tiến độ của học viên trong lớp bạn dạy.
        </p>
        {denied ? (
          <div role="alert" className="mt-6 flex w-full gap-3 rounded-2xl border border-[#ffc9c2] bg-[#fff1ef] px-4 py-3.5 text-left">
            <span className="material-symbols-outlined mt-0.5 text-[22px] text-[#c4261d]" aria-hidden="true">
              error
            </span>
            <div>
              <p className="text-[15px] font-bold text-[#93000a]">Tài khoản này chưa có quyền giáo viên</p>
              <p className="mt-1 text-[14px] leading-5 text-[#414753]">
                {email ? (
                  <>
                    Bạn đang đăng nhập bằng <strong>{email}</strong>.{" "}
                  </>
                ) : null}
                Nhắn quản trị NaNu NaNa để được cấp quyền, rồi đăng nhập lại.
              </p>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() =>
            denied
              ? void signOut({ redirect: false }).then(() => signIn("google", { callbackUrl: "/" }))
              : void signIn("google", { callbackUrl: "/" })
          }
          className={`mt-6 flex h-[52px] w-full items-center justify-center gap-3 rounded-2xl border-2 border-[#e5e5ea] bg-white text-[16px] font-bold text-[#1b1b1d] shadow-[0_3px_0_#e5e5ea] active:translate-y-[3px] active:shadow-none ${FOCUS_RING}`}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
            <path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
          </svg>
          {denied ? "Dùng tài khoản Google khác" : "Đăng nhập với Google"}
        </button>
        <p className="mt-5 text-[13px] text-[#6e6e73]">teacher.nanugo.app</p>
      </div>
    </main>
  );
}

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => void signOut({ callbackUrl: "/login" })}
      className={`h-9 rounded-xl px-3 text-[13px] font-semibold text-[#5e5e63] hover:bg-[#f0edef] ${FOCUS_RING}`}
    >
      Đăng xuất
    </button>
  );
}

type TrendPoint = { label: string; lektion: string; average: number | null; rated: number };

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: TrendPoint }[] }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-[#e5e5ea] bg-white px-3 py-2 text-[13px] shadow-[0_6px_20px_rgba(17,24,39,0.08)]">
      <div className="font-bold text-[#1b1b1d]">
        {point.label} · {point.lektion}
      </div>
      <div className="text-[#414753]">
        {point.average === null ? `Chưa đủ đánh giá (${point.rated})` : `★ ${point.average.toLocaleString("vi")} · ${point.rated} đánh giá`}
      </div>
    </div>
  );
}

/** Average stars per session, oldest first. Sessions under 3 ratings leave a gap. */
export function TrendChart({ points }: { points: TrendPoint[] }) {
  const summary = points
    .filter((point) => point.average !== null)
    .map((point) => `${point.label}: ${point.average}`)
    .join(", ");
  return (
    <figure className="m-0">
      <div className="h-[240px]" role="img" aria-label={`Điểm trung bình theo buổi. ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 12, right: 12, bottom: 4, left: -18 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
            <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: "#c1c6d6", strokeWidth: 1 }} />
            <Line
              type="linear"
              dataKey="average"
              stroke={BLUE}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls={false}
              dot={{ r: 4, fill: BLUE, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 6, fill: BLUE, stroke: "#fff", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

type ActivityPoint = { day: string; label: string; parts: number };

function ActivityTooltip({ active, payload }: { active?: boolean; payload?: { payload: ActivityPoint }[] }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div className="rounded-xl border border-[#e5e5ea] bg-white px-3 py-2 text-[13px] shadow-[0_6px_20px_rgba(17,24,39,0.08)]">
      <div className="font-bold text-[#1b1b1d]">{point.label}</div>
      <div className="text-[#414753]">{point.parts} phần</div>
    </div>
  );
}

/** Parts per day over 30 days, with the 4-a-day target as a reference line. */
export function ActivityChart({ points, target }: { points: ActivityPoint[]; target: number }) {
  const active = points.filter((point) => point.parts > 0).length;
  const met = points.filter((point) => point.parts >= target).length;
  return (
    <figure className="m-0">
      <div className="h-[220px]" role="img" aria-label={`Số phần mỗi ngày trong ${points.length} ngày: ${active} ngày có học, ${met} ngày đạt ${target} phần.`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 12, right: 8, bottom: 4, left: -24 }} barCategoryGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={6} />
            <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} />
            <Tooltip content={<ActivityTooltip />} cursor={{ fill: "rgba(0,113,227,0.06)" }} />
            <ReferenceLine y={target} stroke="#c25e00" strokeWidth={1.5} strokeDasharray="6 5" />
            <Bar dataKey="parts" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} minPointSize={2}>
              {points.map((point) => (
                <Cell key={point.day} fill={point.parts === 0 ? "#d1d1d6" : point.parts >= target ? BLUE : BLUE_LIGHT} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-4 text-[12px] text-[#5e5e63]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: BLUE }} />
          Đạt {target} phần
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: BLUE_LIGHT }} />
          Dưới {target} phần
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t-2 border-dashed border-[#c25e00]" />
          Mục tiêu
        </span>
      </figcaption>
    </figure>
  );
}
