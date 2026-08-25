/**
 * The Drip Markets lockup, NYSE style: DRIP carries the weight, MARKETS is set
 * lighter and letter spaced beside it. One component so the nav, the footer and
 * anything else that says the name say it identically.
 */
export function Wordmark({ size = "md" }: { size?: "md" | "lg" }) {
  const drip = size === "lg" ? "text-3xl" : "text-2xl";
  const markets = size === "lg" ? "text-[15px]" : "text-[12px]";
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={`${drip} font-extrabold leading-none tracking-tightest`}>DRIP</span>
      <span className={`${markets} font-medium uppercase leading-none tracking-widest`}>Markets</span>
    </span>
  );
}
