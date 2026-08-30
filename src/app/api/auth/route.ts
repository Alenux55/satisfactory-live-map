import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { isValidEmail, isValidUsername, verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie, setSessionCookie } from "@/lib/auth/session";
import { inviteSignupEnabled, verifyViewerInvite } from "@/lib/auth/invite-store";
import {
  consumeResetToken,
  createFirstAdmin,
  createResetToken,
  createUser,
  getUserByEmail,
  getUserByUsername,
  setUserPassword,
  SetupCompleteError,
  updateUser,
  userCount,
} from "@/lib/auth/store";
import { currentUser, requireUser } from "@/lib/auth/guard";
import { publicOrigin, sendPasswordResetEmail, smtpConfigured } from "@/lib/auth/mail";
import { MIN_PASSWORD_LENGTH, toPublicUser, type UserPrefs } from "@/lib/auth/types";
import { logger, withRequestLog } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const loginHits = new Map<string, { count: number; resetAt: number }>();
const resetHits = new Map<string, { count: number; resetAt: number }>();

function compactHits(hits: Map<string, { count: number; resetAt: number }>, now: number): void {
  if (hits.size < 1_000) return;
  for (const [key, hit] of hits) {
    if (hit.resetAt < now) hits.delete(key);
  }
}

function rateAllowed(
  hits: Map<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  compactHits(hits, now);
  const hit = hits.get(key);
  if (!hit && hits.size >= 10_000) return false;
  if (!hit || hit.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  hit.count += 1;
  return hit.count <= limit;
}

function loginAllowed(key: string): boolean {
  return rateAllowed(loginHits, key, 8, 15 * 60 * 1000);
}

function rateKey(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("base64url");
}

function trustedClientAddress(request: Request): string | null {
  if (process.env.FICSIT_TRUST_PROXY !== "1") return null;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

function passwordResetAllowed(request: Request, identifier: string): boolean {
  const accountAllowed = rateAllowed(
    resetHits,
    `account:${rateKey(identifier)}`,
    1,
    5 * 60 * 1000,
  );
  const address = trustedClientAddress(request);
  const addressAllowed = address
    ? rateAllowed(resetHits, `address:${rateKey(address)}`, 10, 15 * 60 * 1000)
    : true;
  return accountAllowed && addressAllowed;
}

function mismatchPasswords(body: Record<string, unknown>, password: string): string | null {
  if (typeof body.passwordConfirm === "string" && body.passwordConfirm !== password) {
    return "Passwords do not match";
  }
  return null;
}

export async function GET() {
  return withRequestLog("GET", "/api/auth", async () => {
    const setupRequired = (await userCount()) === 0;
    const user = await currentUser();
    return NextResponse.json({
      setupRequired,
      smtpConfigured: await smtpConfigured(),
      signupEnabled: setupRequired ? false : await inviteSignupEnabled(),
      user: user ? toPublicUser(user) : null,
    });
  });
}

export async function POST(request: Request) {
  return withRequestLog("POST", "/api/auth", async () => {
    const body = (await request.json()) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "";

    if (action === "setup") {
      const username = String(body.username ?? "");
      const password = String(body.password ?? "");
      const email = typeof body.email === "string" ? body.email : "";
      if (!isValidUsername(username)) {
        return NextResponse.json({ error: "Username must be 3–32 letters, numbers, or underscores" }, { status: 400 });
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
      }
      const setupConfirm = mismatchPasswords(body, password);
      if (setupConfirm) return NextResponse.json({ error: setupConfirm }, { status: 400 });
      if (email && !isValidEmail(email)) {
        return NextResponse.json({ error: "Invalid email" }, { status: 400 });
      }
      let user;
      try {
        user = await createFirstAdmin({ username, email: email || null, password });
      } catch (error) {
        if (error instanceof SetupCompleteError) {
          return NextResponse.json({ error: error.message }, { status: 409 });
        }
        throw error;
      }
      await setSessionCookie(user.id, request);
      logger.info("first admin created", { username: user.username });
      return NextResponse.json({ user: toPublicUser(user) });
    }

    if (action === "signup") {
      if (!(await inviteSignupEnabled())) {
        return NextResponse.json({ error: "Viewer sign-up is not enabled" }, { status: 403 });
      }
      const username = String(body.username ?? "");
      const password = String(body.password ?? "");
      const email = String(body.email ?? "").trim();
      const invite = String(body.invite ?? "");
      const key = email.toLowerCase() || request.headers.get("x-forwarded-for") || "anon";
      if (!loginAllowed(`signup:${key}`)) {
        return NextResponse.json({ error: "Too many sign-up attempts. Try again in a few minutes." }, { status: 429 });
      }
      if (!isValidUsername(username)) {
        return NextResponse.json({ error: "Username must be 3–32 letters, numbers, or underscores" }, { status: 400 });
      }
      if (!email || !isValidEmail(email)) {
        return NextResponse.json({ error: "Enter the invited email address" }, { status: 400 });
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
      }
      const confirm = mismatchPasswords(body, password);
      if (confirm) return NextResponse.json({ error: confirm }, { status: 400 });
      if (!(await verifyViewerInvite(email, invite))) {
        return NextResponse.json({ error: "That email is not invited or the invite code is wrong" }, { status: 400 });
      }
      try {
        const user = await createUser({
          username,
          email,
          password,
          role: "viewer",
        });
        await setSessionCookie(user.id, request);
        logger.info("viewer signed up", { username: user.username });
        return NextResponse.json({ user: toPublicUser(user) });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Could not create account" },
          { status: 400 },
        );
      }
    }

    if (action === "login") {
      const username = String(body.username ?? "");
      const password = String(body.password ?? "");
      const key = username.toLowerCase() || request.headers.get("x-forwarded-for") || "anon";
      if (!loginAllowed(key)) {
        return NextResponse.json({ error: "Too many sign-in attempts. Try again in a few minutes." }, { status: 429 });
      }
      const user = await getUserByUsername(username);
      if (!user || !(await verifyPassword(password, user.passwordHash))) {
        return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
      }
      await setSessionCookie(user.id, request);
      logger.info("user signed in", { username: user.username, role: user.role });
      return NextResponse.json({ user: toPublicUser(user) });
    }

    if (action === "logout") {
      await clearSessionCookie();
      return NextResponse.json({ ok: true });
    }

    if (action === "forgot") {
      const identifier = String(body.username ?? body.email ?? "").trim();
      const mailReady = await smtpConfigured();
      if (identifier && mailReady && passwordResetAllowed(request, identifier)) {
        const user = identifier.includes("@")
          ? await getUserByEmail(identifier)
          : await getUserByUsername(identifier);
        if (user?.email) {
          try {
            const token = await createResetToken(user.id);
            const url = `${await publicOrigin(request)}/reset?token=${encodeURIComponent(token)}`;
            await sendPasswordResetEmail(user.email, url);
          } catch (error) {
            logger.error("password reset email failed", {
              err: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }
      return NextResponse.json({
        ok: true,
        smtpConfigured: mailReady,
        message: mailReady
          ? "If that account has an email address, a reset link is on its way."
          : "Password reset email is not configured. Ask an admin to set a new password.",
      });
    }

    if (action === "reset") {
      const token = String(body.token ?? "");
      const password = String(body.password ?? "");
      if (password.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
      }
      const resetConfirm = mismatchPasswords(body, password);
      if (resetConfirm) return NextResponse.json({ error: resetConfirm }, { status: 400 });
      const userId = await consumeResetToken(token);
      if (!userId) {
        return NextResponse.json({ error: "That reset link is invalid or expired" }, { status: 400 });
      }
      await setUserPassword(userId, password);
      await setSessionCookie(userId, request);
      return NextResponse.json({ ok: true });
    }

    if (action === "prefs") {
      const user = await requireUser();
      if (user instanceof Response) return user;
      const prefs = body.prefs;
      if (!prefs || typeof prefs !== "object") {
        return NextResponse.json({ error: "Expected prefs" }, { status: 400 });
      }
      const next = await updateUser(user.id, { prefs: prefs as UserPrefs });
      return NextResponse.json({ user: toPublicUser(next) });
    }

    if (action === "password") {
      const user = await requireUser();
      if (user instanceof Response) return user;
      const current = String(body.currentPassword ?? "");
      const next = String(body.password ?? "");
      if (!(await verifyPassword(current, user.passwordHash))) {
        return NextResponse.json({ error: "Current password is wrong" }, { status: 400 });
      }
      if (next.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
      }
      await setUserPassword(user.id, next);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  });
}
