"use client";

/**
 * Route level error boundary. When anything in a page throws, the reader gets the
 * actual message in the house style instead of a blank screen, plus a retry.
 * A visible error is a bug report; a white page is a mystery.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-xl border border-ink p-8">
        <div className="text-micro font-bold uppercase tracking-widest text-cyan-dark">
          Something broke
        </div>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tighter">
          The app hit an error
        </h1>
        <p className="num mt-5 break-words border border-faint bg-wash p-4 text-[13px]">
          {error.message || "Unknown client error"}
          {error.digest ? ` (digest ${error.digest})` : ""}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center border border-ink bg-ink px-5 py-3 text-[13px] font-bold uppercase tracking-widest text-paper"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
