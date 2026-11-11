import { AvatarMime, PublicUser } from "../../domain/user/user";
import { avatarType } from "../../domain/user/userRules";
import { AppError } from "../errors";
import { Deps } from "../ports";

/** The photo arrives already cropped and shrunk by the browser, as binary. */
export async function setAvatar(deps: Deps, userId: number, data: Buffer): Promise<PublicUser> {
  const mime = avatarType(data);
  if (!mime) throw new AppError("unsupported", "La foto debe ser una imagen JPG, PNG o WebP.");
  await deps.avatars.save(userId, mime, data);
  return (await deps.users.findById(userId))!;
}

export async function removeAvatar(deps: Deps, userId: number): Promise<PublicUser> {
  await deps.avatars.remove(userId);
  return (await deps.users.findById(userId))!;
}

export async function getAvatar(deps: Deps, userId: number): Promise<{ mime: AvatarMime; data: Buffer }> {
  const avatar = await deps.avatars.find(userId);
  if (!avatar) throw new AppError("not_found", "No tienes foto de perfil.");
  return avatar;
}
