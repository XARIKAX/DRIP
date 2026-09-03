import Image from "next/image";
import type { ReactNode } from "react";
import { SHOTS } from "@/components/docs/shots";

/**
 * The typographic parts a reference document is built from.
 *
 * Every one of these is presentational and takes its vocabulary from the design
 * system: serial numbers on sections, hairlines for structure, dark panels for
 * anything that is data (a diagram, a code block), paper for anything that is read.
 * Nothing here knows what the docs say — that lives in sections.tsx.
 */

export function Section({
  id,
  index,
  title,
  kicker,
  children,
}: {
  id: string;
  index: string;
  title: string;
  kicker?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      data-doc-section
      className="scroll-mt-28 border-t border-line-soft pt-14 first:border-t-0 first:pt-0"
    >
      <h2 className="display flex items-baseline gap-4 text-headline">
        <span className="num shrink-0 text-[16px] font-medium text-cyan-deep">{index}</span>
        <span>{title}</span>
      </h2>
      {kicker ? <p className="kicker mt-4 max-w-prose">{kicker}</p> : null}
      <div className="docs-prose mt-8">{children}</div>
    </section>
  );
}

export function Sub({
  id,
  index,
  title,
  children,
}: {
  id: string;
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div id={id} data-doc-section className="scroll-mt-28 pt-6">
      <h3 className="flex items-baseline gap-3 text-[19px] font-semibold tracking-tight text-ink">
        <span className="num shrink-0 text-[12px] font-medium text-cyan-deep">{index}</span>
        <span>{title}</span>
      </h3>
      <div className="docs-prose mt-4">{children}</div>
    </div>
  );
}

/** A note in the margin's voice: one label, a few lines, a cyan rule down the side. */
export function Callout({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside className="max-w-prose border-l-2 border-cyan-dark bg-paper-2 px-5 py-4">
      <div className="serial text-cyan-deep">{label}</div>
      <div className="mt-2 text-[14px] leading-relaxed text-muted">{children}</div>
    </aside>
  );
}

/** An equation or an identity, set in mono on paper so it reads as a rule, not prose. */
export function Formula({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="max-w-prose border border-line bg-paper-2 px-5 py-4">
      <div className="num whitespace-pre-wrap text-[13.5px] leading-[1.7] text-ink">{children}</div>
      {note ? <div className="mt-2 text-[12.5px] leading-relaxed text-faint">{note}</div> : null}
    </div>
  );
}

/** Term and definition, the way a prospectus opens. */
export function Terms({ rows }: { rows: { term: string; def: ReactNode }[] }) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="data-table text-[13.5px]">
        <thead>
          <tr>
            <th className="w-[30%]">Term</th>
            <th>Definition</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.term}>
              <td className="font-semibold text-cyan-deep">{r.term}</td>
              <td className="leading-relaxed text-muted">{r.def}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Table({
  head,
  rows,
  align = [],
  mono = [],
}: {
  head: string[];
  rows: ReactNode[][];
  /** Right aligned columns, by index. */
  align?: number[];
  /** Mono set columns, by index. Identifiers, numbers, addresses. */
  mono?: number[];
}) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="data-table text-[13.5px]">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} className={align.includes(i) ? "text-right" : ""}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => (
                <td
                  key={ci}
                  className={`leading-relaxed ${align.includes(ci) ? "text-right" : ""} ${
                    mono.includes(ci) ? "num text-[12.5px] text-ink" : ci === 0 ? "font-medium text-ink" : "text-muted"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Parameter sheet: name, value, and the one line that says why the value is what it is. */
export function Params({ rows }: { rows: { name: string; value: ReactNode; note?: ReactNode }[] }) {
  return (
    <dl className="border border-line">
      {rows.map((r) => (
        <div
          key={r.name}
          className="grid gap-x-6 gap-y-1 border-b border-line-soft px-5 py-3.5 last:border-b-0 sm:grid-cols-[1fr_auto]"
        >
          <dt className="text-[13.5px] font-medium text-ink">{r.name}</dt>
          <dd className="num text-[13.5px] text-cyan-deep sm:text-right">{r.value}</dd>
          {r.note ? <dd className="text-[12.5px] leading-relaxed text-faint sm:col-span-2">{r.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Code and configuration. Dark, because it is machine text; mono, because it is data. */
export function Code({ title, lang, children }: { title?: string; lang?: string; children: string }) {
  return (
    <figure className="panel">
      {title || lang ? (
        <div className="flex items-center justify-between border-b border-panel-line px-4 py-2.5">
          <span className="panel-title">{title}</span>
          <span className="font-mono text-nano uppercase text-panel-faint">{lang}</span>
        </div>
      ) : null}
      <pre className="dark-scroll overflow-x-auto px-4 py-4 font-mono text-[12.5px] leading-[1.65] text-panel-text">
        <code>{children}</code>
      </pre>
    </figure>
  );
}

/** A diagram. Framed like the mechanism scene: an instrument's glass inset into the page. */
export function Figure({ n, caption, children }: { n: number; caption: ReactNode; children: ReactNode }) {
  return (
    <figure className="panel-frame p-4 md:p-6">
      <div className="pointer-events-none absolute inset-0 grid-bg-dark opacity-50" aria-hidden />
      <div className="relative">{children}</div>
      <figcaption className="relative mt-4 flex items-baseline gap-3 border-t border-panel-line pt-4 text-[12.5px] leading-relaxed text-panel-muted">
        <span className="num shrink-0 text-nano uppercase tracking-widest text-cyan">Fig. {String(n).padStart(2, "0")}</span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

/**
 * A product screenshot, captured from the running demo at 2x and served as WebP.
 * Dimensions come from the manifest written by the capture script, so the image
 * reserves its own space before it loads and nothing below it jumps.
 */
export function Shot({ name, alt, n, caption }: { name: keyof typeof SHOTS; alt: string; n: number; caption: ReactNode }) {
  const dims = SHOTS[name];
  return (
    <figure className="border border-line bg-paper-2 p-2 md:p-3">
      <Image
        src={`/docs/${name}.webp`}
        width={dims.width}
        height={dims.height}
        alt={alt}
        sizes="(min-width: 1280px) 760px, (min-width: 1024px) 640px, 100vw"
        className="block h-auto w-full border border-line-soft"
      />
      <figcaption className="mt-3 flex items-baseline gap-3 px-1 pb-1 text-[12.5px] leading-relaxed text-muted">
        <span className="num shrink-0 text-nano uppercase tracking-widest text-cyan-deep">Fig. {String(n).padStart(2, "0")}</span>
        <span>{caption}</span>
      </figcaption>
    </figure>
  );
}

/** Two figures or two notes side by side above md, stacked below it. */
export function Pair({ children }: { children: ReactNode }) {
  return <div className="grid gap-5 md:grid-cols-2">{children}</div>;
}
