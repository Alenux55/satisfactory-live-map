import { getUserById } from "./store";
import { readSessionCookie } from "./session";
import type { UserRecord } from "./types";

export function unauthorized(message = "Sign in required"): Response {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Admin only"): Response {
  return Response.json({ error: message }, { status: 403 });
}

export async function currentUser(): Promise<UserRecord | null> {
  const session = await readSessionCookie();
  if (!session) return null;
  return getUserById(session.uid);
}

export async function requireUser(): Promise<UserRecord | Response> {
  const user = await currentUser();
  if (!user) return unauthorized();
  return user;
}

export async function requireAdmin(): Promise<UserRecord | Response> {
  const user = await requireUser();
  if (user instanceof Response) return user;
  if (user.role !== "admin") return forbidden();
  return user;
}
