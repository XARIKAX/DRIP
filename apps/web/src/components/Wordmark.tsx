/**
 * The Osinko mark.
 *
 * A square aperture — the position you keep — with its top-right segment detached and
 * set in cyan: the dividend, leaving, while the shape itself stays whole. It is the
 * entire product in one glyph, which is the only justification a logo ever has.
 *
 * One component, so the nav, the footer, the OG image and the favicon say the name
 * identically everywhere.
 */
export function Mark({ size = 22, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* The position: a square ring, open at the top right. */}
      <path
        d="M15 2.6H2.6v18.8h18.8V9"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="square"
      />
      {/* The dividend: the segment that separated. */}
      <rect x="18" y="2.6" width="5.4" height="3.4" fill="#35C2DB" />
    </svg>
  );
}

export function Wordmark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const type = size === "lg" ? "text-[30px]" : size === "sm" ? "text-[17px]" : "text-[22px]";
  const glyph = size === "lg" ? 28 : size === "sm" ? 16 : 20;

  // The wordmark is set in the display face. A brand whose logotype is in a different
  // typeface from its headlines has two identities and commits to neither.
  return (
    <span className={`inline-flex items-center gap-3 text-ink ${className}`}>
      <Mark size={glyph} />
      <span className={`font-display ${type} font-semibold leading-none tracking-[0.06em]`}>
        OSINKO
      </span>
    </span>
  );
}
