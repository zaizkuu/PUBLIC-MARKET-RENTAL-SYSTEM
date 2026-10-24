/* ============================================================
   Sign-in accounts
   ============================================================

   Who may open the system, and how a password is checked. Everything here
   runs on this computer with the Web Crypto API built into the browser engine
   — no server, no internet — so signing in works exactly as offline as the
   rest of the system.

   A password is never stored. What is kept is a PBKDF2-SHA-256 hash of it
   with a random salt per account, at a work factor that makes guessing slow;
   the same goes for an administrator's recovery code. Repeated wrong
   passwords lock the account for a while, longer each time.

   Plain TypeScript with no imports, so the Node test runner loads it as-is
   (see tests/accounts.test.mjs). The screens are in LoginScreen.tsx and
   AccountSettings.tsx.
   ============================================================ */

export type Role = 'Administrator' | 'Staff';
export const ROLES: Role[] = ['Administrator', 'Staff'];

export type Account = {
  id: string;
  name: string;
  position: string;
  /* Administrators manage accounts and may restore or reset the records;
     staff do everything else. */
  role: Role;
  /* Empty until the person chooses a password at their first sign-in. */
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
  /* Set when an administrator gave the person a temporary password: they
     choose their own before getting in. */
  mustChangePassword: boolean;
  /* An administrator's way back in if the password is forgotten:
     "<iterations>$<hash>" of a one-time code shown when it was issued. */
  recoveryHash: string;
  recoverySalt: string;
  failedAttempts: number;
  /* ISO time the account is locked until, or ''. */
  lockedUntil: string;
  lastSignIn: string;
  createdAt: string;
  passwordChangedAt: string;
};

/* Public account details safe to show on the sign-in screen. */
export type AccountSummary = Pick<Account, 'id' | 'name' | 'position' | 'role'>;

/* OWASP's figure for PBKDF2-HMAC-SHA-256. Stored per account, so raising it
   later only affects passwords set from then on. */
export const PBKDF2_ITERATIONS = 600_000;
const RECOVERY_ITERATIONS = 100_000;
export const PASSWORD_MIN_LENGTH = 8;
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 5;
const LOCKOUT_CAP_MINUTES = 60;

/* ---------- Hashing ---------- */

function subtle(): SubtleCrypto {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error('This window cannot check passwords securely. Open the system from its desktop shortcut.');
  return api;
}

function randomBytes(count: number): Uint8Array {
  const bytes = new Uint8Array(count);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  let text = '';
  bytes.forEach((b) => { text += String.fromCharCode(b); });
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function derive(secret: string, salt: string, iterations: number): Promise<string> {
  const key = await subtle().importKey('raw', new TextEncoder().encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt) as BufferSource, iterations }, key, 256);
  return toBase64(new Uint8Array(bits));
}

/* Compares every character whatever the first difference, so the time taken
   says nothing about how much of a guess was right. */
function sameText(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/* ---------- Passwords ---------- */

export const hasPassword = (account: Account) => !!account.passwordHash;

export async function withPassword(account: Account, password: string, now: Date, opts: { mustChange?: boolean } = {}): Promise<Account> {
  const salt = toBase64(randomBytes(16));
  return {
    ...account,
    passwordHash: await derive(password, salt, PBKDF2_ITERATIONS),
    passwordSalt: salt,
    passwordIterations: PBKDF2_ITERATIONS,
    mustChangePassword: !!opts.mustChange,
    failedAttempts: 0,
    lockedUntil: '',
    passwordChangedAt: now.toISOString(),
  };
}

export async function checkPassword(account: Account, password: string): Promise<boolean> {
  if (!hasPassword(account) || !password) return false;
  const hash = await derive(password, account.passwordSalt, account.passwordIterations || PBKDF2_ITERATIONS);
  return sameText(hash, account.passwordHash);
}

/* Words nobody should be able to guess their way into the market's records
   with. Short on purpose: the length and mix rules do most of the work. */
const COMMON = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'abc12345',
  'iloveyou1', 'admin123', 'administrator', 'welcome1', 'letmein1', 'tanauan1', 'tanauan123', 'market123', 'palengke1',
]);

export type PasswordRule = { label: string; met: boolean };

/** The rules a new password must meet, each with whether it does — shown as a checklist while typing. */
export function passwordRules(password: string, name: string): PasswordRule[] {
  const lower = password.toLowerCase();
  const nameWords = name.toLowerCase().split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 3 && !['engr', 'jr', 'sr'].includes(w));
  return [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
    { label: 'Has a letter and a number', met: /[a-zñ]/i.test(password) && /\d/.test(password) },
    { label: 'Does not contain your name', met: password.length > 0 && !nameWords.some((w) => lower.includes(w)) },
    { label: 'Is not a common password', met: password.length > 0 && !COMMON.has(lower) },
  ];
}

/** Why a new password cannot be used, or '' if it can. */
export function passwordProblem(password: string, confirm: string, name: string): string {
  const unmet = passwordRules(password, name).find((r) => !r.met);
  if (unmet) return `The password must meet every rule: ${unmet.label.toLowerCase()}.`;
  if (password !== confirm) return 'The two passwords do not match. Type the same password in both boxes.';
  return '';
}

/* ---------- Lockout ---------- */

/** Milliseconds until a locked account may try again; 0 when it is not locked. */
export function lockRemainingMs(account: Account, now: Date): number {
  const until = account.lockedUntil ? Date.parse(account.lockedUntil) : NaN;
  return Number.isFinite(until) ? Math.max(0, until - now.getTime()) : 0;
}

/* Every fifth wrong password in a row locks the account: five minutes the
   first time, doubling each time after, up to an hour. */
export function afterFailedAttempt(account: Account, now: Date): Account {
  const failedAttempts = account.failedAttempts + 1;
  if (failedAttempts % MAX_FAILED_ATTEMPTS !== 0) return { ...account, failedAttempts };
  const round = failedAttempts / MAX_FAILED_ATTEMPTS - 1;
  const minutes = Math.min(LOCKOUT_CAP_MINUTES, LOCKOUT_MINUTES * 2 ** round);
  return { ...account, failedAttempts, lockedUntil: new Date(now.getTime() + minutes * 60_000).toISOString() };
}

export function afterSignIn(account: Account, now: Date): Account {
  return { ...account, failedAttempts: 0, lockedUntil: '', lastSignIn: now.toISOString() };
}

/** Attempts left before the next lock. */
export function attemptsLeft(account: Account): number {
  return MAX_FAILED_ATTEMPTS - (account.failedAttempts % MAX_FAILED_ATTEMPTS);
}

/* ---------- Recovery codes ---------- */

/* No 0/O or 1/I, so a code copied off paper is copied right. 32 symbols,
   so each random byte maps onto one with no bias. 16 of them is 80 bits. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRecoveryCode(): string {
  const chars = [...randomBytes(16)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return chars.match(/.{4}/g)!.join('-');
}

const tidyCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

export async function withRecoveryCode(account: Account, code: string): Promise<Account> {
  const salt = toBase64(randomBytes(16));
  return { ...account, recoverySalt: salt, recoveryHash: `${RECOVERY_ITERATIONS}$${await derive(tidyCode(code), salt, RECOVERY_ITERATIONS)}` };
}

export async function checkRecoveryCode(account: Account, code: string): Promise<boolean> {
  const [iterations, hash] = account.recoveryHash.split('$');
  if (!hash || !tidyCode(code)) return false;
  return sameText(await derive(tidyCode(code), account.recoverySalt, Number(iterations) || RECOVERY_ITERATIONS), hash);
}

/* ---------- The list of accounts ---------- */

export function blankAccount(fields: AccountSummary, now: Date): Account {
  return {
    ...fields,
    passwordHash: '', passwordSalt: '', passwordIterations: 0, mustChangePassword: false,
    recoveryHash: '', recoverySalt: '',
    failedAttempts: 0, lockedUntil: '', lastSignIn: '',
    createdAt: now.toISOString(), passwordChangedAt: '',
  };
}

/* The first time the system starts there is nobody to sign in as, so the head
   of the office board — the market supervisor — is given an administrator
   account with no password yet. The password is chosen at the first sign-in,
   and everybody else's accounts are added from Settings. */
export function firstAccounts(head: { name: string; position: string } | undefined, now: Date): Account[] {
  return [blankAccount({
    id: 'ACC-001',
    name: head?.name || 'Market Supervisor',
    position: head?.position || 'Market Supervisor',
    role: 'Administrator',
  }, now)];
}

/** An account read back from storage, forced into shape — or null if it has no id. */
export function normalizeAccount(raw: unknown): Account | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  const id = text(r.id).trim();
  if (!id) return null;
  return {
    id,
    name: text(r.name).trim() || 'Unnamed account',
    position: text(r.position).trim(),
    role: r.role === 'Administrator' ? 'Administrator' : 'Staff',
    passwordHash: text(r.passwordHash),
    passwordSalt: text(r.passwordSalt),
    passwordIterations: Number(r.passwordIterations) || 0,
    mustChangePassword: r.mustChangePassword === true || r.mustChangePassword === 1,
    recoveryHash: text(r.recoveryHash),
    recoverySalt: text(r.recoverySalt),
    failedAttempts: Math.max(0, Number(r.failedAttempts) || 0),
    lockedUntil: text(r.lockedUntil),
    lastSignIn: text(r.lastSignIn),
    createdAt: text(r.createdAt),
    passwordChangedAt: text(r.passwordChangedAt),
  };
}

export function nextAccountId(accounts: Account[]): string {
  const highest = accounts.map((a) => parseInt(a.id.replace(/\D/g, ''), 10)).filter(Number.isFinite);
  return `ACC-${String((highest.length ? Math.max(...highest) : 0) + 1).padStart(3, '0')}`;
}

export function initialsOf(name: string): string {
  const words = name.replace(/^(engr|dr|atty|hon|mr|mrs|ms)\.?\s+/i, '').split(/[\s,]+/).filter((w) => /[a-z]/i.test(w) && !/^[a-z]\.$/i.test(w));
  return ((words[0]?.[0] ?? '') + (words.length > 1 ? words[words.length - 1][0] : '')).toUpperCase() || '?';
}

const administrators = (accounts: Account[]) => accounts.filter((a) => a.role === 'Administrator');

/** Why `target` cannot be removed by `actorId`, or '' if it can. */
export function removalProblem(accounts: Account[], target: Account, actorId: string): string {
  if (target.id === actorId) return 'You cannot remove the account you are signed in with.';
  if (target.role === 'Administrator' && administrators(accounts).length <= 1) return 'This is the only administrator account. Make another account an administrator first.';
  return '';
}

/** Why `target` cannot take `role`, or '' if it can. */
export function roleChangeProblem(accounts: Account[], target: Account, role: Role): string {
  if (target.role === 'Administrator' && role !== 'Administrator' && administrators(accounts).length <= 1) {
    return 'The system needs at least one administrator. Make another account an administrator first.';
  }
  return '';
}
