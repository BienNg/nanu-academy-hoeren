"use client";

function HeartGlyph({ filled, id }: { filled: boolean; id: string }) {
  return (
    <svg width="22" height="20" viewBox="0 0 24 22" aria-hidden="true" className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff8a80" />
          <stop offset="42%" stopColor="#ff3b30" />
          <stop offset="100%" stopColor="#d70015" />
        </linearGradient>
      </defs>
      <path
        d="M12 20.1C7.1 16.5 2.4 13.2 2.4 8.5 2.4 5.6 4.6 3.4 7.4 3.4c1.7 0 3.2.8 4.1 2.1.9-1.3 2.4-2.1 4.1-2.1 2.8 0 5 2.2 5 5.1 0 4.7-4.7 8-8.6 11.6z"
        fill={filled ? `url(#${id})` : "#f3f3f5"}
        stroke={filled ? "#b00012" : "#e1e1e4"}
        strokeWidth={filled ? 0.75 : 1.25}
        strokeLinejoin="round"
      />
      {filled ? (
        <ellipse
          cx="8.1"
          cy="7.4"
          rx="2.1"
          ry="1.15"
          fill="white"
          opacity="0.7"
          transform="rotate(-32 8.1 7.4)"
        />
      ) : null}
    </svg>
  );
}

/** Hearts left in a practice part or jump test. The heart being lost plays its break animation. */
export function PartHearts({
  remaining,
  total,
  breakingIndex,
}: {
  remaining: number;
  total: number;
  breakingIndex: number | null;
}) {
  return (
    <div
      className="flex items-center gap-0.5"
      role="img"
      aria-label={`${remaining} trên ${total} tim`}
    >
      {Array.from({ length: total }, (_, index) => {
        const filled = index < remaining || index === breakingIndex;
        return (
          <span key={index} className={index === breakingIndex ? "heart-break" : undefined}>
            <HeartGlyph filled={filled} id={`practice-heart-${index}`} />
          </span>
        );
      })}
    </div>
  );
}
