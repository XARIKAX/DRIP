/**
 * One line per event, JSON, to stdout. Railway captures stdout and nothing else, so
 * anything that matters at 3am has to go through here rather than into a file.
 */
type Fields = Record<string, unknown>;

function emit(level: string, message: string, fields?: Fields): void {
  const line: Fields = { ts: new Date().toISOString(), level, message, ...fields };
  // BigInt has no JSON representation and throws rather than degrading, which would
  // take the process down from inside the logger.
  process.stdout.write(
    `${JSON.stringify(line, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}\n`
  );
}

export const log = {
  info: (message: string, fields?: Fields) => emit("info", message, fields),
  warn: (message: string, fields?: Fields) => emit("warn", message, fields),
  error: (message: string, fields?: Fields) => emit("error", message, fields),
};
