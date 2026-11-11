import { PublicUser } from "../../domain/user/user";
import { checkEmail, checkName, checkPhone } from "../../domain/user/userRules";
import { AppError, EmailTakenError } from "../errors";
import { Deps, ProfileFields } from "../ports";
import { valid } from "../validation";

export interface ProfileInput {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  currentPassword?: unknown;
}

const emailTaken = () => new AppError("conflict", "Ya existe otra cuenta con ese correo.", { field: "email" });

/** Sensitive changes require the current password even with an open session. */
export async function passwordMatches(deps: Deps, userId: number, password: unknown): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0) return false;
  const stored = await deps.users.passwordHash(userId);
  return !!stored && deps.passwords.verify(password, stored);
}

/** The email is how the user signs in, so changing it requires the current password. */
async function emailChange(deps: Deps, user: PublicUser, input: ProfileInput): Promise<string | undefined> {
  const email = valid(checkEmail(input.email), "email");
  if (email === user.email) return undefined;
  if (!(await passwordMatches(deps, user.id, input.currentPassword))) {
    throw new AppError("forbidden", "Para cambiar el correo, escribe tu contraseña actual correctamente.", { field: "currentPassword" });
  }
  if (await deps.users.emailTaken(email, user.id)) throw emailTaken();
  return email;
}

/** Updates name, email and phone. Only what arrives in the body changes. */
export async function updateProfile(deps: Deps, user: PublicUser, input: ProfileInput): Promise<PublicUser> {
  const fields: ProfileFields = {};
  if (input.name !== undefined) fields.name = valid(checkName(input.name), "name");
  if (input.phone !== undefined) fields.phone = valid(checkPhone(input.phone), "phone");
  if (input.email !== undefined) {
    const email = await emailChange(deps, user, input);
    if (email) fields.email = email;
  }
  if (Object.keys(fields).length > 0) {
    try {
      await deps.users.update(user.id, fields);
    } catch (error) {
      // Two accounts asking for the same email at once: the database has the last word.
      if (error instanceof EmailTakenError) throw emailTaken();
      throw error;
    }
  }
  return (await deps.users.findById(user.id))!;
}
