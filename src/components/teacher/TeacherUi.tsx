import Link from "next/link";
import type { ReactNode } from "react";
import { RATING_TAG_LABEL, RATING_TAGS_HIGH, type BehindReason, type PaceTier, type RatingTag } from "@/lib/session-ratings";

/** Shared pieces of the teacher site (teacher.nanugo.app). Server components unless noted. */

export const CARD = "rounded-[22px] border border-[#e5e5ea] bg-white";
export const H2 = "font-[family-name:var(--font-plus-jakarta-sans)] text-[18px] font-extrabold text-[#1b1b1d]";
export const MUTED = "text-[#5e5e63]";

const STAR_PATH = "M12 2.6l2.85 5.9 6.45.8-4.75 4.45 1.2 6.4L12 17l-5.75 3.15 1.2-6.4L2.7 9.3l6.45-.8z";
const VI_WEEKDAYS = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"] as const;

/** "Thứ Tư, 14.10" */
export function viDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${VI_WEEKDAYS[new Date(`${day}T00:00:00Z`).getUTCDay()]}, ${date}.${month}`;
}

/** "14.10" */
export function shortDay(day: string): string {
  const [, month, date] = day.split("-");
  return `${date}.${month}`;
}

export function seenLabel(days: number | null): string {
  if (days === null) return "Chưa vào app";
  if (days === 0) return "Hôm nay";
  if (days === 1) return "Hôm qua";
  return `${days} ngày trước`;
}

export function reasonLabel(reason: BehindReason, lektionGap: number | null, days: number | null): string {
  if (reason === "low-pace") return "ít luyện tập";
  if (reason === "behind-lektion") return `chậm ${lektionGap ?? 1} Lektion`;
  return days === null ? "chưa vào app" : `${days} ngày không vào app`;
}

/** A class page's path; keys may contain spaces or Vietnamese letters. `base` comes from `teacherBase()`. */
export function classHref(base: string, key: string, rest = ""): string {
  return `${base}/${encodeURIComponent(key)}${rest}`;
}

export function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function Star({ fill = 1, size = 16 }: { fill?: number; size?: number }) {
  const width = Math.max(0, Math.min(1, fill)) * 24;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" className="shrink-0">
      <path d={STAR_PATH} fill="#E5E5EA" />
      {width > 0 ? (
        <svg width={width} height="24" viewBox={`0 0 ${width} 24`} preserveAspectRatio="xMinYMin slice">
          <path d={STAR_PATH} fill="#FFC800" stroke="#F0A800" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      ) : null}
    </svg>
  );
}

/** Five stars filled to `value` (partial stars allowed). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span role="img" aria-label={`${value.toLocaleString("vi")} trên 5 sao`} className="inline-flex gap-px">
      {[1, 2, 3, 4, 5].map((index) => (
        <Star key={index} fill={value - index + 1} size={size} />
      ))}
    </span>
  );
}

const AVATAR_COLORS = ["#0071e3", "#c25e00", "#1f8a4c", "#8e44ad", "#c4261d", "#5856d6", "#00838f", "#232f4b"];

export function Avatar({ name, image, size = 36 }: { name: string; image: string | null; size?: number }) {
  const parts = name.trim().split(/\s+/);
  const initials = (parts.length > 1 ? `${parts.at(-2)?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}` : (parts[0] ?? "?").slice(0, 2)).toUpperCase();
  const color = AVATAR_COLORS[[...name].reduce((sum, char) => sum + char.charCodeAt(0), 0) % AVATAR_COLORS.length];
  if (image) {
    // Google photos; next/image is not worth a resize request per avatar here.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full font-[family-name:var(--font-plus-jakarta-sans)] font-bold text-white"
      style={{ width: size, height: size, background: color, fontSize: Math.round(size * 0.36) }}
    >
      {initials}
    </span>
  );
}

const PACE_STYLE: Record<PaceTier, string> = {
  good: "bg-[#eaf7ee] text-[#1b6b34]",
  mid: "bg-[#fff4e0] text-[#8a4300]",
  low: "bg-[#ffecea] text-[#a3150c]",
};

export function PaceChip({ pace, tier }: { pace: number; tier: PaceTier }) {
  return (
    <span className={`inline-flex h-7 items-center rounded-full px-2.5 text-[14px] font-bold tabular-nums ${PACE_STYLE[tier]}`}>
      {pace.toLocaleString("vi", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
    </span>
  );
}

export function BehindDot() {
  return <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#e0352b]" />;
}

export function StatCard({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "danger" }) {
  return (
    <div className={`${CARD} px-4 py-3.5 sm:px-5 sm:py-4`}>
      <div className={`text-[13px] font-semibold ${MUTED}`}>{label}</div>
      <div
        className={`mt-1 font-[family-name:var(--font-plus-jakarta-sans)] text-[22px] font-extrabold leading-8 tabular-nums sm:text-[28px] sm:leading-9 ${tone === "danger" ? "text-[#c4261d]" : "text-[#1b1b1d]"}`}
      >
        {value} {sub ? <span className="text-[15px] font-semibold text-[#5e5e63]">{sub}</span> : null}
      </div>
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-1 self-start text-[14px] font-bold text-[#0059b5] hover:text-[#004c99]">
      <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
        chevron_left
      </span>
      {children}
    </Link>
  );
}

export function EmptyState({ icon, title, text, tone }: { icon: ReactNode; title: string; text: string; tone?: "good" }) {
  return (
    <div
      className={`flex flex-col items-center rounded-[22px] border px-6 py-10 text-center ${
        tone === "good" ? "border-[#c9ead3] bg-[#eaf7ee]" : "border-[#e5e5ea] bg-white"
      }`}
    >
      {icon}
      <h2 className={`mt-4 ${H2}`}>{title}</h2>
      <p className={`mt-2 max-w-sm text-[14px] leading-[21px] ${tone === "good" ? "text-[#1b4d2b]" : MUTED}`}>{text}</p>
    </div>
  );
}

/** Horizontal count bars with the value at the end. Labels always visible, so colour is never alone. */
export function CountBars({
  rows,
}: {
  rows: { key: string; label: ReactNode; count: number; color?: string }[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul className="grid grid-cols-[minmax(32px,auto)_minmax(0,1fr)_28px] gap-x-3 gap-y-2.5">
      {rows.map((row) => (
        <li key={row.key} className="col-span-3 grid grid-cols-subgrid items-center text-[14px]">
          <span className="font-semibold text-[#414753]">{row.label}</span>
          <span className="h-3 rounded-full bg-[#f0edef]">
            <span
              className="block h-3 rounded-full"
              style={{ width: `${(row.count / max) * 100}%`, background: row.color ?? "#FFC800" }}
            />
          </span>
          <span className="text-right font-semibold tabular-nums text-[#414753]">{row.count}</span>
        </li>
      ))}
    </ul>
  );
}

const PRAISE = "#0071e3";
const CRITICISM = "#e07800";

/** Tag counts as bars, most frequent first; praise in blue, criticism in orange. */
export function tagRows(tagCounts: Partial<Record<RatingTag, number>>) {
  const high = new Set<string>(RATING_TAGS_HIGH);
  return (Object.entries(tagCounts) as [RatingTag, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ key: tag, label: RATING_TAG_LABEL[tag], count, color: high.has(tag) ? PRAISE : CRITICISM }));
}

export function TagLegend() {
  return (
    <div className="mt-4 flex flex-wrap gap-4 text-[12px] text-[#5e5e63]">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: PRAISE }} />
        Khen
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: CRITICISM }} />
        Cần cải thiện
      </span>
    </div>
  );
}

