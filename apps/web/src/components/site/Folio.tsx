/**
 * A section's running head.
 *
 * Every movement of the page opens the same way: what it is on the left, where you are
 * on the right, and a line of raked sand beneath. The counter is stones rather than a
 * fraction — filled for the ground already covered — because a garden tells you how far
 * you have walked by what is behind you, not by a number.
 */
export function Folio({ serial, index, total = 6 }: { serial: string; index: number; total?: number }) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="reveal eyebrow">{serial}</span>
        <span className="reveal flex items-center gap-1.5" aria-label={`Section ${index} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span
              key={i}
              className={`block h-[5px] w-[5px] rounded-[1px] transition-colors duration-500 ${
                i < index ? "bg-accent" : "bg-line-strong"
              }`}
              aria-hidden
            />
          ))}
        </span>
      </div>
      <div className="reveal rule-sand mt-5" />
    </div>
  );
}
