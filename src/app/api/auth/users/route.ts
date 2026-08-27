import { NextResponse } from "next/server";
import { isValidEmail, isValidUsername } from "@/lib/auth/password";
import { requireAdmin } from "@/lib/auth/guard";
import { createUser, deleteUser, getUserById, listUsers, setUserPassword, updateUser } from "@/lib/auth/store";
import { MIN_PASSWORD_LENGTH, toPublicUser, type UserRole } from "@/lib/auth/types";
import { logger, withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return withRequestLog("GET", "/api/auth/users", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    const users = await listUsers();
    return NextResponse.json({ users: users.map(toPublicUser) });
  });
}

export async function POST(request: Request) {
  return withRequestLog("POST", "/api/auth/users", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as Record<string, unknown>;
    const username = String(body.username ?? "");
    const password = String(body.password ?? "");
    const email = typeof body.email === "string" ? body.email : "";
    const role: UserRole = body.role === "admin" ? "admin" : "viewer";
    if (!isValidUsername(username)) {
      return NextResponse.json({ error: "Username must be 3–32 letters, numbers, or underscores" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
    }
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    try {
      const user = await createUser({ username, email: email || null, password, role });
      logger.info("user created", { by: admin.username, username: user.username, role: user.role });
      return NextResponse.json({ user: toPublicUser(user) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create user" }, { status: 400 });
    }
  });
}

export async function PATCH(request: Request) {
  return withRequestLog("PATCH", "/api/auth/users", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    try {
      if (typeof body.password === "string" && body.password) {
        await setUserPassword(id, body.password);
      }
      const patch: { email?: string | null; role?: UserRole } = {};
      if (body.email !== undefined) {
        const email = typeof body.email === "string" ? body.email.trim() : "";
        if (email && !isValidEmail(email)) {
          return NextResponse.json({ error: "Invalid email" }, { status: 400 });
        }
        patch.email = email || null;
      }
      if (body.role === "admin" || body.role === "viewer") patch.role = body.role;
      const user = Object.keys(patch).length ? await updateUser(id, patch) : await getUserById(id);
      if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
      logger.info("user updated", { by: admin.username, username: user.username });
      return NextResponse.json({ user: toPublicUser(user) });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update user" }, { status: 400 });
    }
  });
}

export async function DELETE(request: Request) {
  return withRequestLog("DELETE", "/api/auth/users", async () => {
    const admin = await requireAdmin();
    if (admin instanceof Response) return admin;
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (id === admin.id) {
      return NextResponse.json({ error: "You cannot delete your own account while signed in" }, { status: 400 });
    }
    try {
      await deleteUser(id);
      logger.info("user deleted", { by: admin.username, id });
      return NextResponse.json({ ok: true });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete user" }, { status: 400 });
    }
  });
}
