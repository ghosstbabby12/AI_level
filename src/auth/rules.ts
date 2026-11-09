// Reglas de los datos de cuenta. Las comparten el registro y la edicion del perfil,
// para que un dato que no se acepta al crear la cuenta tampoco se acepte al editarla.

export type Check<T> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export const MAX_NAME = 40;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 200;
const MAX_EMAIL = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function checkName(value: unknown): Check<string> {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (name.length === 0 || name.length > MAX_NAME) return fail(`Escribe un nombre de hasta ${MAX_NAME} caracteres.`);
  return { ok: true, value: name };
}

export function checkEmail(value: unknown): Check<string> {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email) || email.length > MAX_EMAIL) return fail("El correo no es válido.");
  return { ok: true, value: email };
}

export function checkNewPassword(value: unknown): Check<string> {
  if (typeof value !== "string" || value.length < MIN_PASSWORD || value.length > MAX_PASSWORD) {
    return fail(`La contraseña debe tener entre ${MIN_PASSWORD} y ${MAX_PASSWORD} caracteres.`);
  }
  return { ok: true, value };
}

/**
 * Telefono opcional: vacio o null lo borra. Acepta el formato con que la gente lo escribe
 * (+34 600 12-34-56, (55) 1234 5678) y exige de 7 a 15 digitos, el maximo internacional.
 */
export function checkPhone(value: unknown): Check<string | null> {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value !== "string") return fail("El teléfono no es válido.");
  const phone = value.trim().replace(/\s+/g, " ");
  if (phone.length === 0) return { ok: true, value: null };
  const digits = phone.replace(/\D/g, "").length;
  if (phone.length > 25 || !/^\+?[\d\s().-]+$/.test(phone) || digits < 7 || digits > 15) {
    return fail("El teléfono no es válido: usa solo números, espacios, guiones y un + inicial (de 7 a 15 dígitos).");
  }
  return { ok: true, value: phone };
}

export type AvatarType = "image/jpeg" | "image/png" | "image/webp";
export const MAX_AVATAR_BYTES = 300 * 1024;

/**
 * Tipo real de la imagen segun sus primeros bytes (no segun lo que diga el cliente).
 * Solo formatos de mapa de bits: un SVG podria llevar scripts.
 */
export function avatarType(data: Buffer): AvatarType | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}
