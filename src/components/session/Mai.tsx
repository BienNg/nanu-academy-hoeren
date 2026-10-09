export type MaiMood = "idle" | "hello" | "correct" | "oops" | "listen" | "streak";

/**
 * Mai, the learning companion from design-reference/Mai Character Animation.html.
 * Moods are CSS on `.mai`: idle smiles, hello waves, correct and streak jump,
 * oops shrugs, listen cups an ear. Width sets the height (400×500).
 */
export function Mai({ mood = "idle", className = "" }: { mood?: MaiMood; className?: string }) {
  return (
    <svg
      className={`mai h-auto ${className}`}
      data-mood={mood}
      viewBox="0 0 400 500"
      aria-hidden="true"
    >
      <ellipse className="mai-shadow" cx="200" cy="474" rx="84" ry="10" fill="rgba(0, 0, 0, 0.12)" />

      <g className="mai-figure">
        <rect x="170" y="384" width="26" height="66" rx="13" fill="#1b2b4b" />
        <rect x="204" y="384" width="26" height="66" rx="13" fill="#1b2b4b" />
        <path d="M144 458 Q144 434 172 434 Q198 434 200 458 Z" fill="#ff9500" />
        <path d="M200 458 Q202 434 228 434 Q256 434 256 458 Z" fill="#ff9500" />
        <rect x="140" y="454" width="62" height="12" rx="6" fill="#ffffff" />
        <rect x="198" y="454" width="62" height="12" rx="6" fill="#ffffff" />

        <rect x="186" y="236" width="28" height="36" rx="12" fill="#dca07a" />

        <path d="M152 300 Q152 264 200 264 Q248 264 248 300 L258 380 Q260 400 240 400 L160 400 Q140 400 142 380 Z" fill="#0071e3" />
        <path d="M226 268 Q248 276 248 300 L258 380 Q260 400 240 400 L226 400 Q236 340 226 268 Z" fill="#005bb8" />
        <path d="M178 266 Q200 294 222 266 Z" fill="#d7e2ff" />
        <rect x="146" y="384" width="108" height="14" rx="7" fill="#005bb8" />

        <g className="mai-head">
          <path d="M102 172 C98 92 148 58 200 58 C252 58 302 92 298 172 L302 246 Q304 270 280 270 L120 270 Q96 270 98 246 Z" fill="#2b1f2e" />
          <path d="M120 172 C120 114 154 92 200 92 C246 92 280 114 280 172 C280 232 246 262 200 262 C154 262 120 232 120 172 Z" fill="#f4c49c" />
          <path d="M110 162 C108 96 150 66 200 66 C252 66 294 96 290 162 C278 140 258 126 236 118 C236 130 228 136 218 134 C202 116 172 112 146 124 C130 132 118 146 110 162 Z" fill="#2b1f2e" />
          <path d="M110 150 C106 200 110 238 124 266 L142 266 C130 232 128 192 136 150 Z" fill="#2b1f2e" />
          <path d="M290 150 C294 200 290 238 276 266 L258 266 C270 232 272 192 264 150 Z" fill="#2b1f2e" />
          <path d="M146 90 Q186 74 230 84" fill="none" stroke="#4d3b52" strokeWidth="9" strokeLinecap="round" />
          <rect x="238" y="106" width="30" height="13" rx="6.5" fill="#ff9500" transform="rotate(-28 253 112)" />

          <ellipse cx="146" cy="210" rx="15" ry="9" fill="#ff8e8a" opacity="0.55" />
          <ellipse cx="254" cy="210" rx="15" ry="9" fill="#ff8e8a" opacity="0.55" />
          <ellipse cx="200" cy="208" rx="7" ry="4.5" fill="#e3a27c" />

          <g className="brow-neutral" fill="none" stroke="#2b1f2e" strokeWidth="7" strokeLinecap="round">
            <path d="M148 150 Q166 140 184 148" />
            <path d="M216 148 Q234 140 252 150" />
          </g>
          <g className="brow-worry" fill="none" stroke="#2b1f2e" strokeWidth="7" strokeLinecap="round">
            <path d="M148 150 Q166 150 184 138" />
            <path d="M216 138 Q234 150 252 150" />
          </g>

          <g className="e-open">
            <g className="mai-eye">
              <ellipse cx="166" cy="182" rx="21" ry="24" fill="#ffffff" />
              <g className="mai-pupil">
                <ellipse cx="169" cy="185" rx="13" ry="16" fill="#1b1b1d" />
                <circle cx="164" cy="178" r="5" fill="#ffffff" />
              </g>
              <path d="M146 168 L138 162" stroke="#2b1f2e" strokeWidth="5" strokeLinecap="round" />
            </g>
            <g className="mai-eye">
              <ellipse cx="234" cy="182" rx="21" ry="24" fill="#ffffff" />
              <g className="mai-pupil">
                <ellipse cx="237" cy="185" rx="13" ry="16" fill="#1b1b1d" />
                <circle cx="232" cy="178" r="5" fill="#ffffff" />
              </g>
              <path d="M254 168 L262 162" stroke="#2b1f2e" strokeWidth="5" strokeLinecap="round" />
            </g>
          </g>
          <g className="e-happy" fill="none" stroke="#1b1b1d" strokeWidth="7" strokeLinecap="round">
            <path d="M146 188 Q166 162 186 188" />
            <path d="M214 188 Q234 162 254 188" />
          </g>

          <path className="m m-smile" d="M184 224 Q200 238 216 224" fill="none" stroke="#7a2e3a" strokeWidth="6" strokeLinecap="round" />
          <g className="m m-open">
            <path d="M174 218 Q200 222 226 218 Q224 254 200 254 Q176 254 174 218 Z" fill="#7a2e3a" />
            <path d="M178 219 Q200 223 222 219 L221 227 Q200 230 179 227 Z" fill="#ffffff" />
            <ellipse cx="200" cy="245" rx="12" ry="6" fill="#ff7a85" />
          </g>
          <path className="m m-wavy" d="M184 230 Q192 222 200 230 Q208 238 216 230" fill="none" stroke="#7a2e3a" strokeWidth="6" strokeLinecap="round" />
          <ellipse className="m m-small" cx="200" cy="230" rx="7" ry="8.5" fill="#7a2e3a" />

          <path className="sweat" d="M296 140 Q308 158 296 170 Q284 158 296 140 Z" fill="#7ec8f8" />
        </g>

        <g className="mai-arm-l">
          <rect x="120" y="276" width="32" height="84" rx="16" fill="#0071e3" />
          <rect x="120" y="340" width="32" height="14" rx="7" fill="#005bb8" />
          <circle cx="136" cy="366" r="16" fill="#f4c49c" />
        </g>
        <g className="mai-arm-r">
          <rect x="248" y="276" width="32" height="84" rx="16" fill="#005bb8" />
          <rect x="248" y="340" width="32" height="14" rx="7" fill="#004a96" />
          <circle cx="264" cy="366" r="16" fill="#e8b48c" />
        </g>
      </g>

      <g className="stars">
        <g transform="translate(62 120)">
          <path className="mai-star" d="M0 -14 Q2 -2 14 0 Q2 2 0 14 Q-2 2 -14 0 Q-2 -2 0 -14Z" fill="#ff9500" />
        </g>
        <g transform="translate(340 92)">
          <path className="mai-star" style={{ animationDelay: "0.2s" }} d="M0 -14 Q2 -2 14 0 Q2 2 0 14 Q-2 2 -14 0 Q-2 -2 0 -14Z" fill="#34c759" />
        </g>
        <g transform="translate(350 260)">
          <path className="mai-star" style={{ animationDelay: "0.4s" }} d="M0 -14 Q2 -2 14 0 Q2 2 0 14 Q-2 2 -14 0 Q-2 -2 0 -14Z" fill="#ff9500" />
        </g>
        <g transform="translate(50 280)">
          <path className="mai-star" style={{ animationDelay: "0.6s" }} d="M0 -14 Q2 -2 14 0 Q2 2 0 14 Q-2 2 -14 0 Q-2 -2 0 -14Z" fill="#34c759" />
        </g>
      </g>
    </svg>
  );
}
