/**
 * The Osinko mark.
 *
 * The glyph on the face of the coin, drawn as geometry rather than traced: a sphere
 * lit hard from the left, split down its meridian, with the far hemisphere left as
 * wireframe. It is the product in one shape — a holding you keep whole, and the yield
 * separated off it along a line that does not cut the thing in two.
 *
 * It stays vector while the rest of the garden is pixels, and that is a decision rather
 * than an oversight: a logotype has to be right at a sixteen pixel favicon and at two
 * hundred on an open-graph card, and only one of those is a whole number of cells. The
 * pixel language earns its place where it can be placed on the grid.
 *
 * No `<defs>`, no ids, no masks — the crescent is one path with an even-odd fill. Ids
 * inside an inlined SVG collide the moment the mark appears twice on a page, which it
 * does on every page here.
 */
export function Mark({ size = 24, className = "" }: { size?: number; className?: string }) {
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
      {/* The sphere. */}
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />

      {/* The lit limb: the outer disc with an offset disc punched out of it. */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20Zm4.6 .9a9.2 9.2 0 1 0 0 18.2 9.2 9.2 0 1 0 0-18.2Z"
        fill="currentColor"
      />

      {/* The meridian. The dividend, separated, without the holding being cut. */}
      <path d="M12 1.6v20.8" stroke="currentColor" strokeWidth="1.1" />

      {/* The far hemisphere, left as wireframe. */}
      <g stroke="currentColor" strokeWidth="0.9" opacity="0.5">
        <path d="M12 2a3.4 10 0 0 1 0 20" />
        <path d="M12 2a6.6 10 0 0 1 0 20" />
        <path d="M12 7h8.7" />
        <path d="M12 12h10" />
        <path d="M12 17h8.7" />
      </g>
    </svg>
  );
}

/**
 * The lockup. One component, so the nav, the footer, the favicon and the social card
 * say the name identically everywhere.
 */
export function Wordmark({
  size = "md",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const type = size === "lg" ? "text-[27px]" : size === "sm" ? "text-[16px]" : "text-[20px]";
  const glyph = size === "lg" ? 30 : size === "sm" ? 19 : 23;

  return (
    <span className={`inline-flex items-center gap-2.5 text-ink ${className}`}>
      <Mark size={glyph} />
      <span className={`display ${type} leading-none`} style={{ letterSpacing: "-0.02em" }}>
        Osinko
      </span>
    </span>
  );
}

/**
 * The name at the scale it deserves, cropped by whatever contains it.
 *
 * Set as SVG text with an explicit `textLength`, which is the load-bearing part: the
 * wordmark has to span the frame edge to edge, and a DOM element sized in viewport
 * units would be a different width the moment the display face is not the one that
 * loaded. `lengthAdjust="spacing"` opens the tracking rather than stretching the
 * letters, so it fits without distorting.
 *
 * Both the hero and the footer render this, which is why it is a component rather than
 * two pieces of markup that have to be kept in agreement.
 */
export function GhostWordmark({
  className = "",
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 1000 200"
      preserveAspectRatio="none"
      className={`block h-full w-full ${className}`}
      style={style}
      aria-hidden
      focusable="false"
    >
      <text
        x="500"
        y="168"
        textAnchor="middle"
        textLength="988"
        lengthAdjust="spacing"
        fill="currentColor"
        className="font-display"
        style={{ fontSize: 200, fontWeight: 800 }}
      >
        OSINKO
      </text>
    </svg>
  );
}
