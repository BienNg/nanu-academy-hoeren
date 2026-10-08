/** Direction 1a from design-reference/NaNu Go logo directions. */

const INK = "#1E2A4A";
const YELLOW = "#FFC21A";
const YELLOW_EDGE = "#E09A00";
const BLUE = "#129BE0";
const BLUE_EDGE = "#0B6FB0";

type Tone = "ink" | "onBlue";

/**
 * "NaNu" plus the tilted yellow "Go" pill. Proportions are in em, matching
 * direction 1a at 84px. Pass `size` in px, or a `text-*` class.
 */
export function Wordmark({
  size,
  tone = "ink",
  fontFamily = "var(--font-fredoka), Fredoka, sans-serif",
  className,
}: {
  size?: number;
  tone?: Tone;
  fontFamily?: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      style={{
        display: "flex",
        width: "fit-content",
        alignItems: "center",
        gap: "0.143em",
        paddingBottom: "0.12em",
        fontFamily,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1,
      }}
    >
      <span
        style={{
          display: "flex",
          color: tone === "onBlue" ? "#ffffff" : INK,
          letterSpacing: "-0.01em",
        }}
      >
        NaNu
      </span>
      <span
        style={{
          display: "flex",
          background: YELLOW,
          color: INK,
          padding: "0.048em 0.286em 0.119em",
          borderRadius: "0.31em",
          boxShadow: `0 0.095em 0 ${YELLOW_EDGE}`,
          transform: "rotate(-4deg)",
        }}
      >
        Go
      </span>
    </span>
  );
}

const MARK_AT = 120;

/**
 * Square app mark from 1a: blue tile, white N, small "go" pill.
 * `shadow` is the 3D bottom edge; turn it off when the tile fills an icon file.
 */
export function AppMark({
  size,
  shadow = true,
  rounded = true,
  fontFamily = "Fredoka",
}: {
  size: number;
  shadow?: boolean;
  rounded?: boolean;
  fontFamily?: string;
}) {
  const scale = size / MARK_AT;
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        borderRadius: rounded ? 32 * scale : 0,
        background: BLUE,
        ...(shadow ? { boxShadow: `0 ${8 * scale}px 0 ${BLUE_EDGE}` } : {}),
      }}
    >
      <div
        style={{
          display: "flex",
          marginTop: -6 * scale,
          fontFamily,
          fontWeight: 700,
          fontSize: 80 * scale,
          lineHeight: 1,
          color: "#ffffff",
        }}
      >
        N
      </div>
      <div
        style={{
          position: "absolute",
          right: 10 * scale,
          bottom: 14 * scale,
          display: "flex",
          background: YELLOW,
          color: INK,
          fontFamily,
          fontWeight: 700,
          fontSize: 22 * scale,
          lineHeight: 1,
          padding: `${1 * scale}px ${9 * scale}px ${3 * scale}px`,
          borderRadius: 10 * scale,
          boxShadow: `0 ${3 * scale}px 0 ${YELLOW_EDGE}`,
          transform: "rotate(-6deg)",
        }}
      >
        go
      </div>
    </div>
  );
}
