import { SignJWT, jwtVerify } from "jose";
import { readAuthToken } from "./token";
import type { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "delta_warranty_service_secret_key_2026_super_secure"
);

export interface AuthSessionUser {
  UserId: string;
  Username: string;
  FirstName: string;
  LastName?: string | null;
  Email?: string | null;
  Role: string;
  IsAdmin: boolean;
  ServiceCenterId?: string | null;
  /** Screen rights (comma-separated form / module keys; only these screens are open, blank = dashboard only). Refreshed on every app load by /api/Auth/getUser. */
  FormRights?: string | null;
}

export async function signAuthToken(user: AuthSessionUser): Promise<string> {
  return await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_SECRET);
}

export async function verifyAuthToken(token: string): Promise<AuthSessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AuthSessionUser;
  } catch (err) {
    return null;
  }
}

export async function sessionFromRequest(
  request: NextRequest | Request
): Promise<AuthSessionUser | null> {
  const token = readAuthToken(request);
  if (!token) return null;
  return await verifyAuthToken(token);
}
