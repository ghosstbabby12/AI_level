import { checkNewPassword } from "../../domain/user/userRules";
import { AppError } from "../errors";
import { Deps } from "../ports";
import { valid } from "../validation";
import { passwordMatches } from "./updateProfile";

/** Changing the password closes every other session: whoever knew it is locked out. */
export async function changePassword(
  deps: Deps,
  userId: number,
  sessionToken: string | undefined,
  input: { currentPassword?: unknown; newPassword?: unknown },
): Promise<void> {
  if (!(await passwordMatches(deps, userId, input.currentPassword))) {
    throw new AppError("forbidden", "La contraseña actual no es correcta.", { field: "currentPassword" });
  }
  const password = valid(checkNewPassword(input.newPassword), "newPassword");
  if (password === input.currentPassword) {
    throw new AppError("invalid", "La nueva contraseña debe ser distinta de la actual.", { field: "newPassword" });
  }
  await deps.users.setPasswordHash(userId, deps.passwords.hash(password));
  await deps.sessions.removeOthers(userId, sessionToken);
}
