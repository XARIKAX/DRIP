import type { ReactNode } from "react";
import { Stone } from "@/components/pixel/Scenery";

export interface Step {
  h: string;
  p: string;
}

/**
 * Three numbered steps under a screen, explaining what it just did.
 *
 * This block existed three times — on Split, on Borrow and on the Pool — in three
 * copies that had already drifted in their markup while saying the same thing. One
 * component, and the numbering becomes stones on the same grid as the rest of the
 * garden rather than a mono serial that has to be kept in step by hand.
 */
export function Steps({
  label,
  title = "How it works",
  steps,
  children,
}: {
  /** Names the section for a screen reader: "How borrowing works". */
  label: string;
  title?: string;
  steps: readonly Step[];
  /** Anything that belongs under the steps — a collateral grid, a footnote. */
  children?: ReactNode;
}) {
  return (
    <section aria-label={label} className="space-y-6 [--cell:2px]">
      <div>
        <div className="eyebrow">{title}</div>
        <div className="mt-4">
          {steps.map((s, i) => (
            <div key={s.h} className="hairline-t grid gap-2 py-5 md:grid-cols-12 md:gap-6">
              <div className="flex items-center gap-2 md:col-span-1" aria-hidden>
                {Array.from({ length: i + 1 }, (_, k) => (
                  <Stone key={k} size={2} cell="calc(var(--cell) * 1.2)" />
                ))}
              </div>
              <h3 className="text-[17px] font-extrabold tracking-tight md:col-span-4">{s.h}</h3>
              <p className="text-[14px] leading-relaxed text-muted md:col-span-7">{s.p}</p>
            </div>
          ))}
        </div>
      </div>
      {children}
    </section>
  );
}
