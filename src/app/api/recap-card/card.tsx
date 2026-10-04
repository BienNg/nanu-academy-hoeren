import type { ReactNode } from "react";
import type { WeeklyRecapCard } from "@/lib/weekly-recap-store";

/** Portrait 4:5, the size Facebook, Instagram and Zalo show without cropping. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

const BLUE = "#0071e3";
const BLUE_DEEP = "#003f88";
const INK = "#1d1d1f";
const MUTED = "#6e6e73";
const ORANGE = "#ff9500";
const GREEN = "#34c759";

function formatNumber(value: number): string {
  return value.toLocaleString("vi-VN");
}

function Icon({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 64,
        height: 64,
        borderRadius: 20,
        background: `${color}1f`,
      }}
    >
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </div>
  );
}

const ICONS = {
  target: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </g>
  ),
  check: (
    <g>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16.5 9.5" />
    </g>
  ),
  headphones: (
    <g>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3.5" y="14" width="4" height="6" rx="1.5" />
      <rect x="16.5" y="14" width="4" height="6" rx="1.5" />
    </g>
  ),
  calendar: (
    <g>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </g>
  ),
};

function StatTile({
  icon,
  color,
  label,
  value,
  detail,
  detailColor = MUTED,
}: {
  icon: ReactNode;
  color: string;
  label: string;
  value: string;
  detail?: string | null;
  detailColor?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 434,
        padding: "22px 28px",
        borderRadius: 32,
        background: "#f5f5f7",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <Icon color={color}>{icon}</Icon>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: MUTED }}>{label}</div>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 8 }}>
        <div style={{ display: "flex", fontSize: 60, fontWeight: 800, color: INK, letterSpacing: -1.5 }}>{value}</div>
        {detail ? (
          <div style={{ display: "flex", fontSize: 26, fontWeight: 800, color: detailColor }}>{detail}</div>
        ) : null}
      </div>
    </div>
  );
}

function Avatar({ image, name }: { image: string | null; name: string }) {
  const frame = {
    width: 152,
    height: 152,
    borderRadius: 76,
    border: "6px solid rgba(255,255,255,0.9)",
  };
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} width={152} height={152} alt="" style={{ ...frame, objectFit: "cover" }} />;
  }
  return (
    <div
      style={{
        ...frame,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.18)",
        fontSize: 68,
        fontWeight: 800,
        color: "white",
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function RecapCard({
  card,
  logoSrc,
  imageSrc,
}: {
  card: WeeklyRecapCard;
  logoSrc: string;
  /** The profile photo as a data URI, or null to draw the initial. */
  imageSrc: string | null;
}) {
  const { profile, recap } = card;
  const accuracyDelta =
    recap.accuracy != null && recap.previousAccuracy != null
      ? recap.accuracy - recap.previousAccuracy
      : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "56px 56px 48px",
        background: `linear-gradient(160deg, #2b8cff 0%, ${BLUE} 38%, ${BLUE_DEEP} 100%)`,
        fontFamily: "Be Vietnam Pro",
        color: "white",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 76,
              height: 76,
              borderRadius: 22,
              background: "white",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} width={62} height={62} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 32, fontWeight: 800 }}>NaNu NaNa Du Hoc Duc</div>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 500, opacity: 0.8 }}>
              Học tiếng Đức tại NaNu NaNa
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700, opacity: 0.8 }}>Tổng kết tuần</div>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 800 }}>{recap.rangeLabel}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 32, marginTop: 40 }}>
        <Avatar image={imageSrc} name={profile.displayName} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              fontSize: profile.displayName.length > 22 ? 48 : 60,
              fontWeight: 800,
              letterSpacing: -1.5,
              lineHeight: 1.1,
            }}
          >
            {profile.displayName}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 14 }}>
            {profile.className ? (
              <div
                style={{
                  display: "flex",
                  padding: "8px 20px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.18)",
                  fontSize: 24,
                  fontWeight: 700,
                }}
              >
                Lớp {profile.className}
              </div>
            ) : null}
            {recap.streakDays != null && recap.streakDays > 0 ? (
              <div
                style={{
                  display: "flex",
                  padding: "8px 20px",
                  borderRadius: 999,
                  background: ORANGE,
                  fontSize: 24,
                  fontWeight: 800,
                }}
              >
                Chuỗi {recap.streakDays} ngày
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 32 }}>
        <div style={{ display: "flex", fontSize: 30, fontWeight: 700, opacity: 0.85 }}>XP tuần này</div>
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 800, letterSpacing: -4, lineHeight: 1.05 }}>
            {formatNumber(recap.xp)}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 28,
          padding: 32,
          borderRadius: 44,
          background: "white",
          color: INK,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          {recap.days.map((day) => (
            <div key={day.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 84,
                  height: 84,
                  borderRadius: 42,
                  background: day.active ? BLUE : "#f0f0f3",
                  border: day.active ? "none" : "3px dashed #d2d2d7",
                }}
              >
                {day.active ? (
                  <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                ) : null}
              </div>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: day.active ? INK : MUTED }}>
                {day.label}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", rowGap: 20, marginTop: 28 }}>
          <StatTile
            icon={ICONS.calendar}
            color={BLUE}
            label="Ngày học"
            value={`${recap.activeDays}/7`}
          />
          <StatTile
            icon={ICONS.target}
            color={GREEN}
            label="Độ chính xác"
            value={recap.accuracy != null ? `${recap.accuracy}%` : "–"}
            detail={
              accuracyDelta != null && accuracyDelta !== 0
                ? `${accuracyDelta > 0 ? "+" : "-"}${Math.abs(accuracyDelta)}%`
                : null
            }
            detailColor={accuracyDelta != null && accuracyDelta > 0 ? GREEN : MUTED}
          />
          <StatTile icon={ICONS.check} color={ORANGE} label="Bài luyện đạt" value={formatNumber(recap.partsPassed)} />
          <StatTile
            icon={ICONS.headphones}
            color="#af52de"
            label="Câu đã luyện"
            value={formatNumber(recap.clipsPracticed)}
          />
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: -0.5,
          textAlign: "center",
        }}
      >
        {recap.headline}
      </div>
    </div>
  );
}

