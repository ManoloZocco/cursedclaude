import Database from "better-sqlite3";
import { homedir, platform } from "os";
import { join } from "path";
import { existsSync } from "fs";
import crypto from "crypto";

export interface CursorAuth {
  accessToken: string;
  refreshToken: string | null;
  email: string | null;
  membershipType: string | null;
  machineId: string | null;
}

const DB_KEYS = {
  accessToken: "cursorAuth/accessToken",
  refreshToken: "cursorAuth/refreshToken",
  email: "cursorAuth/cachedEmail",
  membershipType: "cursorAuth/stripeMembershipType",
  machineId: "storage.serviceMachineId",
} as const;

function findCursorDbPath(): string {
  const home = homedir();
  const os = platform();

  const candidates =
    os === "darwin"
      ? [join(home, "Library", "Application Support", "Cursor", "User", "globalStorage", "state.vscdb")]
      : os === "win32"
        ? [join(home, "AppData", "Roaming", "Cursor", "User", "globalStorage", "state.vscdb")]
        : [
            join(home, ".config", "Cursor", "User", "globalStorage", "state.vscdb"),
            join(home, ".config", "cursor", "User", "globalStorage", "state.vscdb"),
          ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    `Cursor database not found. Tried:\n${candidates.map((c) => `  - ${c}`).join("\n")}\nMake sure Cursor is installed and you are logged in.`,
  );
}

function readKey(db: Database.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM ItemTable WHERE key = ?").get(key) as
    | { value: string | Buffer }
    | undefined;
  if (!row) return null;
  return typeof row.value === "string" ? row.value : row.value.toString("utf-8");
}

export function extractCursorAuth(): CursorAuth {
  const dbPath = findCursorDbPath();
  const db = new Database(dbPath, { readonly: true });

  try {
    const accessToken = readKey(db, DB_KEYS.accessToken);
    if (!accessToken) {
      throw new Error("No Cursor access token found. Make sure you are logged in to Cursor.");
    }

    return {
      accessToken,
      refreshToken: readKey(db, DB_KEYS.refreshToken),
      email: readKey(db, DB_KEYS.email),
      membershipType: readKey(db, DB_KEYS.membershipType),
      machineId: readKey(db, DB_KEYS.machineId),
    };
  } finally {
    db.close();
  }
}

export function generateSessionId(token: string): string {
  const hash = crypto.createHash("md5").update(token).digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function generateClientKey(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateCursorChecksum(token: string, machineId: string | null): string {
  const effectiveMachineId =
    machineId ?? crypto.createHash("sha256").update(token + "machineId").digest("hex");

  const timestamp = Math.floor(Date.now() / 1e6);

  const byteArray = new Uint8Array([
    (timestamp >> 40) & 255,
    (timestamp >> 32) & 255,
    (timestamp >> 24) & 255,
    (timestamp >> 16) & 255,
    (timestamp >> 8) & 255,
    timestamp & 255,
  ]);

  let t = 165;
  for (let i = 0; i < byteArray.length; i++) {
    byteArray[i] = ((byteArray[i]! ^ t) + (i % 256)) & 255;
    t = byteArray[i]!;
  }

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let encoded = "";
  for (let i = 0; i < byteArray.length; i += 3) {
    const a = byteArray[i]!;
    const b = i + 1 < byteArray.length ? byteArray[i + 1]! : 0;
    const c = i + 2 < byteArray.length ? byteArray[i + 2]! : 0;
    encoded += alphabet[a >> 2];
    encoded += alphabet[((a & 3) << 4) | (b >> 4)];
    if (i + 1 < byteArray.length) encoded += alphabet[((b & 15) << 2) | (c >> 6)];
    if (i + 2 < byteArray.length) encoded += alphabet[c & 63];
  }

  return `${encoded}${effectiveMachineId}`;
}
