/**
 * Token identity without illustration.
 *
 * A square monogram set in the product's own type — no logos, no colour coding, no
 * borrowed brand equity. On a dark canvas the mark is a lifted surface with a hairline;
 * the `dark` prop inverts it to solid for use on the few light surfaces left.
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
        dark
          ? "bg-chalk text-void-deep"
          : "border border-line bg-surface-2 text-dim"
      }`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {letters}
    </span>
  );
}
