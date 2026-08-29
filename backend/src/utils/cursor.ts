// Keyset ("cursor") pagination cursor: encodes the (createdAt, id) of the
// last row seen, so the next page can do
//   WHERE (createdAt, id) < (cursor.createdAt, cursor.id)
// instead of OFFSET, which stays fast no matter how deep you page and
// doesn't shift results if new rows are inserted concurrently.

export interface MessageCursor {
  createdAt: string; // ISO string
  id: string;
}

export function encodeCursor(c: MessageCursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function decodeCursor(raw: string): MessageCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
