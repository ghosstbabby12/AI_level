/** What the app shows about an account (never the password hash). */
export interface PublicUser {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  /** Versioned URL of the profile photo, or null when there is none. */
  avatarUrl: string | null;
  createdAt: string;
}

export type AvatarMime = "image/jpeg" | "image/png" | "image/webp";
