/**
 * A section's running head.
 *
 * Every movement of the landing page opens the way the hero does: a serial on the
 * left, a folio on the right, and the engraved double rule beneath — so the page reads
 * as one numbered document rather than a stack of unrelated blocks. The folio counts
 * the hero as § 01, because it is.
 */
export function Folio({ serial, index, total = 6 }: { serial: string; index: number; total?: number }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <span className="reveal serial">{serial}</span>
        <span className="reveal serial num">
          § {String(index).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
      <div className="reveal rule-double mt-4" />
    </div>
  );
}
