import type { ReactNode } from "react";
import {
  leagueClassLabel,
  resultWeekLabel,
  type AdminWeekClassResult,
  type AdminWeekResults,
} from "@/lib/admin-class-league";

/** Portrait 9:16, so the card fills a phone screen when opened from a group chat. */
export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;

const SITE = "nanugo.app";
const BLUE = "#0071e3";
const BLUE_DEEP = "#003f88";
const INK = "#1d1d1f";
/** Gold, silver, bronze. */
const MEDAL = ["#ffc400", "#c7ccd6", "#e09a5b"] as const;
const NAME_MAX = 26;

export type PodiumPlace = {
  name: string;
  stat: string;
  /** A data URI. Null draws `initials` instead. */
  imageSrc: string | null;
  initials: string;
  /** Best learners of this class, at most 3. Empty on the class card, whose places are learners. */
  people: { name: string; xp: number }[];
};

export type LeagueCardContent = {
  weekLabel: string;
  kicker: string;
  headline: string;
  chips: string[];
  /** First, second, third. Null leaves the place empty. */
  places: (PodiumPlace | null)[];
};

function viCount(value: number): string {
  return value.toLocaleString("vi-VN");
}

function shortName(name: string, max = NAME_MAX): string {
  return name.length > max ? `${name.slice(0, max - 1).trimEnd()}…` : name;
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** The class's name without "Lớp", short enough for an avatar. */
function classInitials(name: string): string {
  return name.replace(/^lớp\s+/iu, "").slice(0, 5).toUpperCase();
}

/** The card for one class's group: its top 3 learners. `photos` follows `row.champions`. */
export function classCardContent(
  results: AdminWeekResults,
  row: AdminWeekClassResult,
  photos: readonly (string | null)[],
): LeagueCardContent {
  const champion = row.champions[0];
  return {
    weekLabel: resultWeekLabel(results.week),
    kicker: `Quán quân tuần · ${leagueClassLabel(row.name)}`,
    headline: champion ? shortName(champion.name) : "Chưa có quán quân",
    chips: champion ? [`${viCount(champion.xp)} XP`] : [],
    places: [0, 1, 2].map((index) => {
      const place = row.champions[index];
      return place
        ? {
            name: shortName(place.name),
            stat: `${viCount(place.xp)} XP`,
            imageSrc: photos[index] ?? null,
            initials: initialOf(place.name),
            people: [],
          }
        : null;
    }),
  };
}

/** The card for the group every class is in: the top 3 classes, each with its best 3 learners. */
export function leagueCardContent(results: AdminWeekResults): LeagueCardContent {
  const ranked = results.classes.filter((row) => row.rank != null);
  const winner = ranked[0];
  return {
    weekLabel: resultWeekLabel(results.week),
    kicker: "Lớp vô địch tuần",
    headline: winner ? shortName(leagueClassLabel(winner.name)) : "Chưa có lớp vô địch",
    chips: winner ? [`${viCount(winner.weekXp)} XP`] : [],
    places: [0, 1, 2].map((index) => {
      const row = ranked[index];
      return row
        ? {
            name: shortName(leagueClassLabel(row.name)),
            stat: `${viCount(row.weekXp)} XP`,
            imageSrc: null,
            initials: classInitials(row.name),
            people: row.participants.slice(0, 3),
          }
        : null;
    }),
  };
}

function Crown() {
  return (
    <svg width="96" height="75" viewBox="0 0 36 28">
      <path d="M3 24 L1 6 L11 14 L18 2 L25 14 L35 6 L33 24 Z" fill={MEDAL[0]} stroke="#b88a00" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="3" y="23" width="30" height="4" rx="1.5" fill="#e0a800" />
    </svg>
  );
}

function Avatar({ place, size, color }: { place: PodiumPlace; size: number; color: string }) {
  const frame = { width: size, height: size, borderRadius: size / 2, border: `10px solid ${color}` };
  if (place.imageSrc) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={place.imageSrc} width={size} height={size} alt="" style={{ ...frame, objectFit: "cover" }} />;
  }
  return (
    <div
      style={{
        ...frame,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.18)",
        fontSize: place.initials.length > 2 ? size * 0.24 : size * 0.42,
        fontWeight: 800,
        color: "white",
      }}
    >
      {place.initials}
    </div>
  );
}

/** Index 0 is first place. Columns are drawn second, first, third. */
const COLUMN = [
  { avatar: 236, nameSize: 44, block: 560 },
  { avatar: 184, nameSize: 38, block: 440 },
  { avatar: 184, nameSize: 38, block: 340 },
] as const;

/** The best learners, drawn inside a class's podium block. Names wrap onto two lines. */
function PlacePeople({ people, height }: { people: { name: string; xp: number }[]; height: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-around",
        width: "100%",
        height,
        padding: "0 20px",
      }}
    >
      {people.map((person, index) => (
        <div key={`${person.name}-${index}`} style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              height: 60,
              overflow: "hidden",
              fontSize: 26,
              fontWeight: 800,
              lineHeight: 1.15,
              color: INK,
            }}
          >
            {person.name}
          </div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 800, color: BLUE }}>{viCount(person.xp)} XP</div>
        </div>
      ))}
    </div>
  );
}

function PodiumColumn({ place, index }: { place: PodiumPlace | null; index: 0 | 1 | 2 }) {
  const column = COLUMN[index];
  const color = MEDAL[index];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 316 }}>
      {index === 0 ? <Crown /> : null}
      {place ? (
        <Avatar place={place} size={column.avatar} color={color} />
      ) : (
        <div
          style={{
            display: "flex",
            width: column.avatar,
            height: column.avatar,
            borderRadius: column.avatar / 2,
            border: "8px dashed rgba(255,255,255,0.35)",
          }}
        />
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          width: 310,
          height: column.nameSize * 2.4,
          marginTop: 16,
          textAlign: "center",
          fontSize: column.nameSize,
          fontWeight: 800,
          lineHeight: 1.15,
          overflow: "hidden",
        }}
      >
        {place ? place.name : ""}
      </div>
      <div style={{ display: "flex", height: 48, fontSize: 36, fontWeight: 700, opacity: 0.85 }}>
        {place ? place.stat : ""}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          width: 306,
          height: column.block,
          marginTop: 18,
          borderTopLeftRadius: 36,
          borderTopRightRadius: 36,
          background: "rgba(255,255,255,0.96)",
          borderTop: `16px solid ${color}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginTop: place?.people.length ? 4 : 10,
            fontSize: place?.people.length ? (index === 0 ? 88 : 64) : index === 0 ? 140 : 110,
            fontWeight: 800,
            color: INK,
          }}
        >
          {index + 1}
        </div>
        {place && place.people.length > 0 ? (
          <PlacePeople people={place.people} height={column.block - (index === 0 ? 108 : 84)} />
        ) : null}
      </div>
    </div>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        padding: "10px 28px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.18)",
        fontSize: 34,
        fontWeight: 800,
      }}
    >
      {children}
    </div>
  );
}

export function LeagueCard({ content, logoSrc }: { content: LeagueCardContent; logoSrc: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        padding: "80px 56px 56px",
        background: `linear-gradient(160deg, #2b8cff 0%, ${BLUE} 38%, ${BLUE_DEEP} 100%)`,
        fontFamily: "Be Vietnam Pro",
        color: "white",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 92,
              height: 92,
              borderRadius: 26,
              background: "white",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} width={76} height={76} alt="" />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800 }}>NaNu NaNa Du Hoc Duc</div>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 500, opacity: 0.8 }}>
              Học tiếng Đức tại NaNu NaNa
            </div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, opacity: 0.8 }}>Giải đấu lớp</div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800 }}>{content.weekLabel}</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 72 }}>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 700, opacity: 0.85 }}>{content.kicker}</div>
        <div
          style={{
            display: "flex",
            fontSize: content.headline.length > 18 ? 72 : 96,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.1,
            marginTop: 8,
          }}
        >
          {content.headline}
        </div>
        {content.chips.length > 0 ? (
          <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
            {content.chips.map((chip) => (
              <Chip key={chip}>{chip}</Chip>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", flex: 1, alignItems: "flex-end", justifyContent: "center", gap: 6 }}>
        <PodiumColumn place={content.places[1] ?? null} index={1} />
        <PodiumColumn place={content.places[0] ?? null} index={0} />
        <PodiumColumn place={content.places[2] ?? null} index={2} />
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 36 }}>
        <div
          style={{
            display: "flex",
            padding: "14px 40px",
            borderRadius: 999,
            background: "white",
            color: BLUE,
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: -0.5,
          }}
        >
          {SITE}
        </div>
      </div>
    </div>
  );
}
