import crypto from "crypto";
import { PasswordHasher } from "../../application/ports";

/** scrypt with a random salt, stored as "salt:hash" in hex. */
export const passwordHasher: PasswordHasher = {
  hash(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);
    return `${salt.toString("hex")}:${hash.toString("hex")}`;
  },
  verify(password, stored) {
    const [saltHex, hashHex] = stored.split(":");
    if (!saltHex || !hashHex) return false;
    const expected = Buffer.from(hashHex, "hex");
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  },
};

export const hashPassword = passwordHasher.hash;
