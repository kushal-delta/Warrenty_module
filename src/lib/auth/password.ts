import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";

/**
 * Password hashing with Node's built-in scrypt (memory-hard, salted, one-way).
 * Stored format: scrypt$N$r$p$<salt base64>$<hash base64> — about 100 characters, fits Users.Password (nvarchar 255).
 * The parameters live in the stored value, so they can be raised later without breaking existing hashes.
 */
const N = 16384, R = 8, P = 1, KEY_LENGTH = 64, SALT_BYTES = 16;
const PREFIX = "scrypt$";

function derive(password: string, salt: Buffer, n: number, r: number, p: number, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, keyLength, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export function isPasswordHash(stored: string | null | undefined) {
  return typeof stored === "string" && stored.startsWith(PREFIX);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return `${PREFIX}${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

/**
 * Checks a password against the stored value in constant time.
 * Legacy rows that still hold plain text are compared directly so those users can sign in once;
 * the login route then replaces them with a hash (see `needsRehash`).
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  if (!isPasswordHash(stored)) {
    const a = Buffer.from(password), b = Buffer.from(stored);
    return a.length === b.length && timingSafeEqual(a, b);
  }
  const [, n, r, p, saltB64, hashB64] = stored.split("$");
  const expected = Buffer.from(hashB64 || "", "base64");
  if (!saltB64 || !expected.length) return false;
  const actual = await derive(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p), expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** True when the stored value is plain text or uses weaker parameters than today's. */
export function needsRehash(stored: string | null | undefined) {
  if (!isPasswordHash(stored)) return true;
  const [, n, r, p] = String(stored).split("$");
  return Number(n) < N || Number(r) < R || Number(p) < P;
}
