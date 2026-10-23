/**
 * The Laine robot (board: Laine assistant robot): black head, sand face,
 * signal-red antenna tip. `idle` · `happy` (hover / focus) · `thinking`.
 */
export function RobotAvatar({
  size = 50,
  expression = "idle",
}: {
  size?: number;
  expression?: "idle" | "happy" | "thinking";
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <line
        x1="32"
        y1="7"
        x2="32"
        y2="15"
        stroke="#000"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="32" cy="6" r="4.5" fill="#cf2e2e" />
      <rect x="5" y="29" width="7" height="14" rx="3.5" fill="#000" />
      <rect x="52" y="29" width="7" height="14" rx="3.5" fill="#000" />
      <rect x="10" y="14" width="44" height="40" rx="17" fill="#000" />
      <rect x="16" y="21" width="32" height="24" rx="11" fill="#F4F0EA" />
      {expression === "thinking" ? (
        <g className="motion-safe:animate-pulse">
          <circle cx="24" cy="33" r="2.4" fill="#000" />
          <circle cx="32" cy="33" r="2.4" fill="#7e7e7e" />
          <circle cx="40" cy="33" r="2.4" fill="#000" />
        </g>
      ) : expression === "happy" ? (
        <>
          <path
            d="M22.5 32 Q25.5 28.5 28.5 32"
            stroke="#000"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M35.5 32 Q38.5 28.5 41.5 32"
            stroke="#000"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M27 37.5 Q32 43 37 37.5"
            stroke="#000"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <ellipse cx="25.5" cy="32" rx="3" ry="4" fill="#000" />
          <ellipse cx="38.5" cy="32" rx="3" ry="4" fill="#000" />
          <circle cx="26.5" cy="30.5" r="1" fill="#fff" />
          <circle cx="39.5" cy="30.5" r="1" fill="#fff" />
          <path
            d="M28 38.5 Q32 42 36 38.5"
            stroke="#000"
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}
      {expression !== "thinking" && (
        <>
          <circle cx="20.5" cy="38.5" r="2.2" fill="#f9e4b4" />
          <circle cx="43.5" cy="38.5" r="2.2" fill="#f9e4b4" />
        </>
      )}
    </svg>
  );
}
