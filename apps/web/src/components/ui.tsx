import type { ReactNode } from "react";

/**
 * The primitives. Every surface in the product is built from these five things,
 * which is why the product looks like one product.
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

/** A labelled number. The label is small and tracked out; the number does the talking. */
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
    <div>
      <div className="eyebrow text-muted">{label}</div>
      <div
        className={`num mt-2 text-3xl font-semibold tracking-tighter md:text-4xl ${
          accent ? "text-cyan-dark" : "text-ink"
        }`}
      >
        {value}
      </div>
      {sub ? <div className="mt-1 text-[13px] text-muted">{sub}</div> : null}
    </div>
  );
}

/** Section heading with a rule above it. Used to break long pages. */
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
    <div className="rule-t flex flex-wrap items-end justify-between gap-4 pt-5">
      <div>
        <Eyebrow className="text-cyan-dark">{eyebrow}</Eyebrow>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tighter md:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 border border-faint px-5 py-6 text-muted">
      <span className="block h-2 w-2 animate-pulse bg-cyan" aria-hidden />
      <span className="eyebrow">{label}</span>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="border border-faint bg-wash px-6 py-10 text-center">
      <div className="text-lg font-bold tracking-tight">{title}</div>
      <p className="mx-auto mt-2 max-w-md text-[14px] text-muted">{body}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="border border-down px-5 py-4">
      <div className="eyebrow text-down">Error</div>
      <p className="mt-2 text-[14px]">{message}</p>
      {retry ? (
        <button type="button" className="btn-ghost btn-sm mt-4" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
