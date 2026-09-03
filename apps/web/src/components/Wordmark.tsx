/**
 * The Osinko wordmark: the name set heavy, closed by a cyan full stop — the one
 * drop of colour, a quiet inheritance from the product's drip-era origins.
 * One component so the nav, the footer and anything else that says the name
 * say it identically.
 */
export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-3xl" : "text-2xl";
  const block = size === "lg" ? "h-2.5 w-2.5" : "h-2 w-2";
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={`${text} font-extrabold leading-none tracking-tightest`}>OSINKO</span>
      <span className={`${block} shrink-0 bg-cyan`} aria-hidden />
    </span>
  );
}
