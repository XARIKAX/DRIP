"use client";

/**
 * Route level error boundary. When anything in a page throws, the reader gets the
 * actual message in the house style instead of a blank screen, plus a retry.
 * A visible error is a bug report; a blank page is a mystery.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-void px-6">
      <div className="card card-pad w-full max-w-xl">
        <div className="eyebrow text-down">Something broke</div>
        <h1 className="mt-4 text-headline font-black tracking-cut text-chalk">
          The app hit an error
        </h1>
        <p className="num mt-6 break-words border border-line-soft bg-surface-2 p-4 text-[13px] text-dim">
          {error.message || "Unknown client error"}
          {error.digest ? ` (digest ${error.digest})` : ""}
        </p>
        <button type="button" onClick={reset} className="btn-primary mt-7">
          Try again
        </button>
      </div>
    </div>
  );
}
