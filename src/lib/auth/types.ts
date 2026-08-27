import { DEFAULT_LAYERS, DEMO_SERVER_ID, type EntityCategory } from "@/lib/world/types";

export type UserRole = "admin" | "viewer";

export type UserPrefs = {
  serverId: string;
  layers: Record<EntityCategory, boolean>;
  hiddenTypes: string[];
};

export type UserRecord = {
  id: string;
  username: string;
  email: string | null;
  passwordHash: string;
  role: UserRole;
  prefs: UserPrefs;
  createdAt: number;
};

export type PublicUser = {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  prefs: UserPrefs;
};

export type ResetTokenRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
};

export const COOKIE_NAME = "ficsit_session";
export const SESSION_DAYS = 14;
export const RESET_TTL_MS = 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

export function defaultPrefs(): UserPrefs {
  return {
    serverId: DEMO_SERVER_ID,
    layers: { ...DEFAULT_LAYERS },
    hiddenTypes: [],
  };
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    prefs: user.prefs,
  };
}
