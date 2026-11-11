import { PublicUser } from "../../domain/user/user";
import { checkEmail, checkName, checkNewPassword } from "../../domain/user/userRules";
import { AppError } from "../errors";
import { Deps } from "../ports";
import { valid } from "../validation";

export interface SignedIn {
  user: PublicUser;
  token: string;
}

async function signIn(deps: Deps, userId: number): Promise<SignedIn> {
  const token = await deps.sessions.create(userId);
  return { user: (await deps.users.findById(userId))!, token };
}

export async function register(deps: Deps, input: { name?: unknown; email?: unknown; password?: unknown }): Promise<SignedIn> {
  const name = valid(checkName(input.name));
  const email = valid(checkEmail(input.email));
  const password = valid(checkNewPassword(input.password));
  if (await deps.users.emailTaken(email)) throw new AppError("conflict", "Ya existe una cuenta con ese correo.");

  const id = await deps.users.create({ name, email, passwordHash: deps.passwords.hash(password) });
  return signIn(deps, id);
}

export async function login(deps: Deps, input: { email?: unknown; password?: unknown }): Promise<SignedIn> {
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const account = await deps.users.findCredentials(email);
  const matches = account && typeof input.password === "string" && deps.passwords.verify(input.password, account.passwordHash);
  if (!matches) throw new AppError("unauthorized", "Correo o contrasena incorrectos.");
  return signIn(deps, account.id);
}

export async function logout(deps: Deps, token: string | undefined): Promise<void> {
  if (token) await deps.sessions.remove(token);
}
