/** Tiny output helpers — colours + JSON/pretty printing, no deps. */

let useColor = process.stdout.isTTY === true && !process.env.NO_COLOR;

export function setColor(on: boolean): void {
  useColor = on;
}

function wrap(code: string, s: string): string {
  return useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export const c = {
  bold: (s: string) => wrap("1", s),
  dim: (s: string) => wrap("2", s),
  red: (s: string) => wrap("31", s),
  green: (s: string) => wrap("32", s),
  yellow: (s: string) => wrap("33", s),
  cyan: (s: string) => wrap("36", s),
};

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

export function info(msg: string): void {
  process.stderr.write(msg + "\n");
}

export function fail(msg: string, code = 1): never {
  process.stderr.write(c.red("error: ") + msg + "\n");
  process.exit(code);
}
