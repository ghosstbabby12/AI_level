import crypto from "crypto";

/** Random, URL-safe token (sessions, WebSocket tickets). */
export const newToken = (bytes = 32): string => crypto.randomBytes(bytes).toString("base64url");

/** Only the token hash is stored: whoever reads the database cannot impersonate sessions. */
export const hashToken = (token: string): string => crypto.createHash("sha256").update(token).digest("hex");
