/**
 * Token identity without illustration: a square monogram in the type system.
 * Ink square with paper letters on light chrome; inverted inside dark panels.
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
      className={`inline-flex shrink-0 items-center justify-center font-sans font-extrabold tracking-tight ${
        dark ? "bg-paper text-ink" : "bg-ink text-paper"
      }`}
      style={{ width: size, height: size, fontSize: size * 0.44 }}
    >
      {letters}
    </span>
  );
}
