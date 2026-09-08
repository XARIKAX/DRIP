"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Copy one string, and say so.
 *
 * Deliberately only the control. Whatever is being copied is rendered by the server
 * component around it, so the value is in the document whether or not this ever
 * hydrates — for a contract address that is the difference between a page a crawler
 * can read and one it cannot.
 */
export function CopyButton({
  value,
  label,
  className = "",
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // A refused clipboard needs no error state: the value is on screen and
      // selectable either way.
      return;
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className={`font-mono text-nano font-medium uppercase text-muted transition-colors duration-300 hover:text-accent ${className}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </>
  );
}
