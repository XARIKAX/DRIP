/**
 * One line per event, to stdout. Railway captures stdout and nothing else, so anything
 * that matters at 3am has to go through here rather than into a file.
 *
 * The line is JSON so it can be parsed, and `message` carries the fields inline so it
 * can be read without being parsed. That duplication is deliberate: Railway's viewer
 * renders structured logs by showing `message` alone and folding every other key away
 * behind a click, which turned `cycle failed` into a line that said nothing at all —
 * the reason was in the payload, one interaction out of sight, at exactly the moment
 * somebody needed it.
 */
type Fields = Record<string, unknown>;

const bigintSafe = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

/** Longest a single value may be before it is cut. Keeps one bad field from eating the line. */
const MAX_VALUE = 300;

function show(v: unknown): string {
  const s =
    typeof v === "bigint" || typeof v === "string" || typeof v === "number" || typeof v === "boolean"
      ? String(v)
      : JSON.stringify(v, bigintSafe);
  const text = s ?? "undefined";
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
}

function emit(level: string, message: string, fields?: Fields): void {
  const rendered = fields
    ? Object.entries(fields)
        .map(([k, v]) => `${k}=${show(v)}`)
        .join(" ")
    : "";
  const line: Fields = {
    ts: new Date().toISOString(),
    level,
    message: rendered ? `${message} ${rendered}` : message,
    ...fields,
  };
  // BigInt has no JSON representation and throws rather than degrading, which would
  // take the process down from inside the logger.
  process.stdout.write(`${JSON.stringify(line, bigintSafe)}\n`);
}

export const log = {
  info: (message: string, fields?: Fields) => emit("info", message, fields),
  warn: (message: string, fields?: Fields) => emit("warn", message, fields),
  error: (message: string, fields?: Fields) => emit("error", message, fields),
};
