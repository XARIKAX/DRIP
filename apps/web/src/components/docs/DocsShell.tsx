"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export interface TocEntry {
  id: string;
  index: string;
  title: string;
  /** Sub entries render indented and smaller. */
  sub?: boolean;
}

export interface TocGroup {
  label: string;
  entries: TocEntry[];
}

export interface GlanceRow {
  label: string;
  value: ReactNode;
}

export interface QuickLink {
  label: string;
  href: string;
  external?: boolean;
}

/**
 * Which section is being read. The last heading whose top has passed the reading
 * line (just under the sticky nav) wins; at the very bottom of the page the last
 * entry wins outright, since a short final section may never reach the line.
 */
function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0] ?? "");

  useEffect(() => {
    let frame = 0;
    const sample = () => {
      frame = 0;
      const line = 140;
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = id;
        else break;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && ids.length) current = ids[ids.length - 1]!;
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(sample);
    };
    sample();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids]);

  return active;
}

/**
 * The three column reading layout.
 *
 * Contents on the left, the document in the middle, the specification sheet on the
 * right — and both rails stick while the middle scrolls, so the reader always knows
 * where they are and what the numbers are without leaving the paragraph. Below `xl`
 * the sheet folds into the flow under the title; below `lg` the contents collapse
 * into a disclosure, because a fifteen row list is not something to pin over a
 * phone's viewport.
 */
export function DocsShell({
  toc,
  glance,
  links,
  hero,
  children,
}: {
  toc: TocGroup[];
  glance: GlanceRow[];
  links: QuickLink[];
  hero: ReactNode;
  children: ReactNode;
}) {
  const ids = toc.flatMap((g) => g.entries.map((e) => e.id));
  const active = useActiveSection(ids);

  return (
    <div className="shell pb-band pt-8 md:pt-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="serial">Osinko protocol · Documentation</span>
        <span className="serial hidden sm:inline">Edition v0.1 · Revised September 2026 · Interfaces frozen</span>
      </div>
      <div className="rule-double mt-4" />

      <div className="mt-10 grid gap-12 lg:grid-cols-[190px_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[190px_minmax(0,1fr)_240px] xl:gap-12">
        {/* Contents */}
        <aside className="min-w-0">
          <div data-toc-scroll className="no-scrollbar lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pr-2">
            <details className="group border border-line lg:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-mono text-micro font-medium uppercase text-ink">
                Contents
                <span className="text-ghost transition-transform duration-300 group-open:rotate-90" aria-hidden>
                  →
                </span>
              </summary>
              <div className="border-t border-line-soft px-4 pb-3">
                <Toc toc={toc} active={active} />
              </div>
            </details>
            <div className="hidden lg:block">
              <div className="serial">Contents</div>
              <div className="mt-4">
                <Toc toc={toc} active={active} marker />
              </div>
            </div>
          </div>
        </aside>

        {/* The document */}
        <article className="min-w-0">
          {hero}
          <div className="mt-12 xl:hidden">
            <Glance rows={glance} layout="grid" />
          </div>
          <div className="mt-16 space-y-14">{children}</div>
        </article>

        {/* The sheet */}
        <aside className="hidden min-w-0 xl:block">
          <div className="sticky top-24 space-y-6">
            <Glance rows={glance} layout="rail" />
            <QuickLinks links={links} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Toc({ toc, active, marker = false }: { toc: TocGroup[]; active: string; marker?: boolean }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState({ top: 0, height: 0 });

  // The marker is measured, not computed: rows vary in height as titles wrap. The
  // list is taller than a laptop viewport, so the live row is also kept inside the
  // sticky container's own scroll — by setting scrollTop, never scrollIntoView, which
  // would drag the page along with it.
  const measure = useCallback(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`a[data-id="${active}"]`);
    if (!list || !row) return;
    setBar({ top: row.offsetTop, height: row.offsetHeight });

    const scroller = list.closest<HTMLElement>("[data-toc-scroll]");
    if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return;
    const rowTop = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const margin = 72;
    if (rowTop - margin < scroller.scrollTop) scroller.scrollTop = Math.max(rowTop - margin, 0);
    else if (rowTop + row.offsetHeight + margin > scroller.scrollTop + scroller.clientHeight) {
      scroller.scrollTop = rowTop + row.offsetHeight + margin - scroller.clientHeight;
    }
  }, [active]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    void fonts?.ready.then(measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <div ref={listRef} className="docs-toc relative">
      {marker ? (
        <span
          className="absolute left-0 w-px bg-cyan-dark transition-all duration-500 ease-osk"
          style={{ top: bar.top, height: bar.height }}
          aria-hidden
        />
      ) : null}
      {toc.map((g) => (
        <div key={g.label} className={`${marker ? "pl-4" : ""} pt-4 first:pt-2`}>
          <div className="font-mono text-nano uppercase tracking-mega text-ghost">{g.label}</div>
          <div className="mt-1.5">
            {g.entries.map((e) => (
              <Link
                key={e.id}
                href={`#${e.id}`}
                data-id={e.id}
                aria-current={active === e.id ? "true" : undefined}
                className={e.sub ? "pl-4 !text-[12.5px]" : ""}
              >
                <span className="num w-8 shrink-0 text-[10.5px] text-ghost">{e.index}</span>
                <span className="min-w-0 leading-snug">{e.title}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The specification sheet. In the rail each row stacks label over value so a value
 * never wraps mid phrase in a 240px column; in the flow below `xl` the same rows
 * become a grid of cells, which is what a sheet looks like when it has the width.
 */
function Glance({ rows, layout }: { rows: GlanceRow[]; layout: "rail" | "grid" }) {
  if (layout === "grid") {
    return (
      <div className="card !p-0">
        <div className="serial border-b border-line-soft px-5 py-3">At a glance</div>
        <dl className="grid grid-cols-2 gap-px bg-line-soft md:grid-cols-3">
          {rows.map((r) => (
            <div key={r.label} className="bg-paper px-5 py-3.5">
              <dt className="text-[11.5px] text-faint">{r.label}</dt>
              <dd className="num mt-1 text-[12.5px] font-medium text-ink">{r.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  return (
    <div className="card !p-6">
      <div className="serial">At a glance</div>
      <dl className="mt-3">
        {rows.map((r) => (
          <div key={r.label} className="border-b border-line-soft py-2.5 last:border-b-0">
            <dt className="text-[11.5px] text-faint">{r.label}</dt>
            <dd className="num mt-0.5 text-[12px] font-medium text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function QuickLinks({ links }: { links: QuickLink[] }) {
  return (
    <div className="card !p-6">
      <div className="serial">Quick links</div>
      <ul className="mt-3">
        {links.map((l) => (
          <li key={l.href + l.label} className="border-b border-line-soft last:border-b-0">
            {l.external ? (
              <a
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between py-2.5 text-[13.5px] text-ink transition-colors hover:text-cyan-deep"
              >
                {l.label}
                <span className="text-ghost transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden>
                  ↗
                </span>
              </a>
            ) : (
              <Link
                href={l.href}
                className="group flex items-center justify-between py-2.5 text-[13.5px] text-ink transition-colors hover:text-cyan-deep"
              >
                {l.label}
                <span className="text-ghost transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden>
                  →
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
