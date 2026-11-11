import { AvatarMime, PublicUser } from "../../domain/user/user";

export interface NewUser {
  email: string;
  name: string;
  passwordHash: string;
}

export type ProfileFields = Partial<Record<"name" | "email" | "phone", string | null>>;

export interface UserRepository {
  findById(id: number): Promise<PublicUser | undefined>;
  findCredentials(email: string): Promise<{ id: number; passwordHash: string } | undefined>;
  passwordHash(id: number): Promise<string | undefined>;
  emailTaken(email: string, exceptId?: number): Promise<boolean>;
  create(user: NewUser): Promise<number>;
  /** Throws EmailTakenError when another account already uses the email. */
  update(id: number, fields: ProfileFields): Promise<void>;
  setPasswordHash(id: number, hash: string): Promise<void>;
}

export interface SessionRepository {
  /** Returns the session token (only its hash is stored). */
  create(userId: number): Promise<string>;
  remove(token: string): Promise<void>;
  /** Closes every other session of the user, keeping this one. */
  removeOthers(userId: number, keepToken: string | undefined): Promise<void>;
  findUser(token: string): Promise<PublicUser | undefined>;
}

export interface AvatarRepository {
  save(userId: number, mime: AvatarMime, data: Buffer): Promise<void>;
  remove(userId: number): Promise<void>;
  find(userId: number): Promise<{ mime: AvatarMime; data: Buffer } | undefined>;
}

export interface PasswordHasher {
  hash(password: string): string;
  verify(password: string, stored: string): boolean;
}
