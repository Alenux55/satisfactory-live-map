import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_LAYERS, DEMO_SERVER_ID } from "@/lib/world/types";
import { hashPassword, normalizeEmail, normalizeUsername } from "./password";
import {
  clampSidebarWidth,
  DEFAULT_LEFT_WIDTH,
  DEFAULT_RIGHT_WIDTH,
  defaultPrefs,
  MIN_PASSWORD_LENGTH,
  RESET_TTL_MS,
  type ResetTokenRecord,
  type UserPrefs,
  type UserRecord,
  type UserRole,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");
const TOKENS_PATH = path.join(DATA_DIR, "reset-tokens.json");

let writeChain: Promise<void> = Promise.resolve();

function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const run = writeChain.then(op, op);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

function coercePrefs(raw: unknown): UserPrefs {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    serverId: typeof rec.serverId === "string" && rec.serverId ? rec.serverId : DEMO_SERVER_ID,
    layers:
      rec.layers && typeof rec.layers === "object"
        ? { ...DEFAULT_LAYERS, ...(rec.layers as UserPrefs["layers"]) }
        : { ...DEFAULT_LAYERS },
    hiddenTypes: Array.isArray(rec.hiddenTypes)
      ? rec.hiddenTypes.filter((value): value is string => typeof value === "string")
      : [],
    hiddenSubs: Array.isArray(rec.hiddenSubs)
      ? rec.hiddenSubs.filter((value): value is string => typeof value === "string")
      : [],
    leftWidth: clampSidebarWidth(Number(rec.leftWidth), DEFAULT_LEFT_WIDTH),
    rightWidth: clampSidebarWidth(Number(rec.rightWidth), DEFAULT_RIGHT_WIDTH),
  };
}

function coerceUser(raw: unknown): UserRecord | null {
  const rec = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!rec) return null;
  if (typeof rec.id !== "string" || typeof rec.username !== "string" || typeof rec.passwordHash !== "string") {
    return null;
  }
  const role: UserRole = rec.role === "admin" ? "admin" : "viewer";
  return {
    id: rec.id,
    username: normalizeUsername(rec.username),
    email: typeof rec.email === "string" ? normalizeEmail(rec.email) : null,
    passwordHash: rec.passwordHash,
    role,
    prefs: coercePrefs(rec.prefs),
    createdAt: typeof rec.createdAt === "number" ? rec.createdAt : Date.now(),
  };
}

export async function listUsers(): Promise<UserRecord[]> {
  const raw = await readJson<unknown[]>(USERS_PATH, []);
  return Array.isArray(raw) ? raw.map(coerceUser).filter((user): user is UserRecord => user != null) : [];
}

export async function userCount(): Promise<number> {
  return (await listUsers()).length;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  return (await listUsers()).find((user) => user.id === id) ?? null;
}

export async function getUserByUsername(username: string): Promise<UserRecord | null> {
  const key = normalizeUsername(username);
  return (await listUsers()).find((user) => user.username === key) ?? null;
}

export async function getUserByEmail(email: string): Promise<UserRecord | null> {
  const key = normalizeEmail(email);
  if (!key) return null;
  return (await listUsers()).find((user) => user.email === key) ?? null;
}

async function saveUsers(users: UserRecord[]): Promise<void> {
  await writeJson(USERS_PATH, users);
}

export async function createUser(input: {
  username: string;
  email?: string | null;
  password: string;
  role: UserRole;
}): Promise<UserRecord> {
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return enqueue(async () => {
    const users = await listUsers();
    const username = normalizeUsername(input.username);
    const email = normalizeEmail(input.email);
    if (users.some((user) => user.username === username)) throw new Error("Username already exists");
    if (email && users.some((user) => user.email === email)) throw new Error("Email already exists");
    const user: UserRecord = {
      id: newId("usr"),
      username,
      email,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      prefs: defaultPrefs(),
      createdAt: Date.now(),
    };
    users.push(user);
    await saveUsers(users);
    return user;
  });
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<UserRecord, "email" | "role" | "prefs" | "passwordHash">>,
): Promise<UserRecord> {
  return enqueue(async () => {
    const users = await listUsers();
    const index = users.findIndex((user) => user.id === id);
    if (index < 0) throw new Error("User not found");
    const next = { ...users[index], ...patch };
    if (patch.role === "viewer" && users[index].role === "admin") {
      const admins = users.filter((user) => user.role === "admin");
      if (admins.length < 2) throw new Error("Cannot demote the last admin");
    }
    if (patch.email !== undefined) {
      const email = normalizeEmail(patch.email);
      if (email && users.some((user) => user.id !== id && user.email === email)) {
        throw new Error("Email already exists");
      }
      next.email = email;
    }
    if (patch.prefs) next.prefs = coercePrefs(patch.prefs);
    users[index] = next;
    await saveUsers(users);
    return next;
  });
}

export async function setUserPassword(id: string, password: string): Promise<void> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  await updateUser(id, { passwordHash: await hashPassword(password) });
}

export async function deleteUser(id: string): Promise<void> {
  await enqueue(async () => {
    const users = await listUsers();
    const target = users.find((user) => user.id === id);
    if (!target) throw new Error("User not found");
    const admins = users.filter((user) => user.role === "admin");
    if (target.role === "admin" && admins.length < 2) {
      throw new Error("Cannot delete the last admin");
    }
    await saveUsers(users.filter((user) => user.id !== id));
  });
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await enqueue(async () => {
    const tokens = await readJson<ResetTokenRecord[]>(TOKENS_PATH, []);
    const kept = tokens.filter((entry) => entry.userId !== userId && entry.expiresAt > Date.now());
    kept.push({
      id: newId("rst"),
      userId,
      tokenHash: hashToken(token),
      expiresAt: Date.now() + RESET_TTL_MS,
    });
    await writeJson(TOKENS_PATH, kept);
  });
  return token;
}

export async function consumeResetToken(token: string): Promise<string | null> {
  return enqueue(async () => {
    const tokens = await readJson<ResetTokenRecord[]>(TOKENS_PATH, []);
    const hash = hashToken(token);
    const now = Date.now();
    const match = tokens.find((entry) => entry.tokenHash === hash && entry.expiresAt > now);
    await writeJson(
      TOKENS_PATH,
      tokens.filter((entry) => entry !== match && entry.expiresAt > now),
    );
    return match?.userId ?? null;
  });
}
