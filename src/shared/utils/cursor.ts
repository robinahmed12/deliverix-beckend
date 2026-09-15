const ENCODING = "base64url";

export function encodeCursor(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString(ENCODING);
}

export function decodeCursor<T extends Record<string, unknown>>(cursor: string): T {
  try {
    return JSON.parse(Buffer.from(cursor, ENCODING).toString("utf-8")) as T;
  } catch {
    throw new Error("Invalid cursor");
  }
}