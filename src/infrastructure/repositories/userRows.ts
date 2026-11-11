import { PublicUser } from "../../domain/user/user";

/** What is read to build a PublicUser (always with a LEFT JOIN on user_avatars). */
export const USER_COLUMNS = "u.id, u.email, u.name, u.phone, u.created_at, a.updated_at AS avatar_at";
export const USER_FROM = "users u LEFT JOIN user_avatars a ON a.user_id = u.id";

export interface UserRow {
  id: number | bigint;
  email: string;
  name: string;
  phone: string | null;
  created_at: string;
  avatar_at: number | bigint | null;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: Number(row.id),
    email: row.email,
    name: row.name,
    phone: row.phone ?? null,
    avatarUrl: row.avatar_at == null ? null : `/api/profile/avatar?v=${Number(row.avatar_at)}`,
    createdAt: row.created_at,
  };
}
