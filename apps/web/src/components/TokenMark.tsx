/**
 * Token identity without illustration.
 *
 * A square monogram set in the product's own type — no logos, no colour coding, no
 * borrowed brand equity. On paper the mark is solid ink; the `dark` prop inverts it to
 * paper-on-black for the data panels, where an ink square would vanish.
 */
export function TokenMark({
  symbol,
  size = 32,
  dark = false,
}: {
  symbol: string;
  size?: number;
  dark?: boolean;
}) {
  const letters = symbol.slice(0, symbol.length > 3 ? 2 : 1);
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center font-sans font-bold tracking-tight ${
        dark ? "bg-panel-text text-panel" : "bg-ink text-paper"
      }`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {letters}
    </span>
  );
}
