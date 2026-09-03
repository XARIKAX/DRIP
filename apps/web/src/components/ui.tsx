import type { ReactNode } from "react";

/**
 * The primitives.
 *
 * Every surface in the product is built from these six things, which is the reason the
 * product looks like one product rather than six pages by four people.
 */

export function Card({
  children,
  className = "",
  pad = true,
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return <div className={`card ${pad ? "card-pad" : ""} ${className}`}>{children}</div>;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`eyebrow ${className}`}>{children}</div>;
}

/**
 * A labelled number. The label is small, mono and tracked out; the number is large and
 * does the talking. The ratio between them is the house style in a single component.
 */
export function Stat({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="eyebrow">{label}</div>
      <div
        className={`figure mt-3 text-[clamp(24px,2.6vw,34px)] leading-none ${
          accent ? "text-cyan" : "text-chalk"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-2 text-[13px] text-dim">{sub}</div> : null}
    </div>
  );
}

/** Section heading with a drawn rule above it. Used to break long pages. */
export function SectionHead({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-t border-line-soft pt-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow className="text-cyan">{eyebrow}</Eyebrow>
          <h2 className="mt-3 text-headline font-black tracking-cut text-chalk">{title}</h2>
        </div>
        {action}
      </div>
    </div>
  );
}

/** Never a spinner: the layout is held while the data settles. */
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 border border-line-soft bg-surface px-5 py-6">
      <span className="beacon" aria-hidden />
      <span className="eyebrow">{label}</span>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="border border-line-soft bg-surface px-6 py-14 text-center">
      <div className="text-title font-bold tracking-tighter text-chalk">{title}</div>
      <p className="mx-auto mt-3 max-w-md text-[14px] leading-relaxed text-dim">{body}</p>
      {action ? <div className="mt-7 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="border border-down/40 bg-down/5 px-5 py-4">
      <div className="eyebrow text-down">Error</div>
      <p className="mt-2 text-[14px] text-chalk">{message}</p>
      {retry ? (
        <button type="button" className="btn-quiet btn-sm mt-4" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
