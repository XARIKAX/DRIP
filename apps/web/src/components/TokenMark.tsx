/**
 * Token identity without illustration.
 *
 * A monogram set in the product's own type — no logos, no colour coding, no borrowed
 * brand equity. It reads its surface from context rather than from a `dark` prop:
 * ink-on-paper in daylight, and the inverse inside a `.night` panel, which is the same
 * one rule the rest of the system now follows.
 */
export function TokenMark({
  symbol,
  size = 32,
  dark = false,
}: {
  symbol: string;
  size?: number;
  /** Kept so existing call sites still typecheck; the surface decides now. */
  dark?: boolean;
}) {
  void dark;
  const letters = symbol.slice(0, symbol.length > 3 ? 2 : 1);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-md border border-line bg-ground-3 font-sans font-bold tracking-tight text-ink"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {letters}
    </span>
  );
}
