import type { NextRequest } from "next/server";

/**
 * RULES §49: One session token, two transports (Cookie & Bearer)
 * Reads auth token from request. Header wins when both are present.
 * Keep dependency-free so it can run safely on Edge runtime.
 */
export function readAuthToken(request: NextRequest | Request): string | null {
  // 1. Check Authorization: Bearer <token> header (mobile / direct API clients)
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    const bearerToken = authHeader.substring(7).trim();
    if (bearerToken) return bearerToken;
  }

  // 2. Check authToken cookie (browser web app)
  if ("cookies" in request && typeof (request as NextRequest).cookies?.get === "function") {
    const cookie = (request as NextRequest).cookies.get("authToken");
    if (cookie?.value) return cookie.value;
  } else {
    // Parse cookie string manually for standard Request objects
    const cookieHeader = request.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)authToken=([^;]*)/);
      if (match && match[1]) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  return null;
}

/**
 * Whether the browser reached us over HTTPS (directly or via a proxy).
 * Browsers drop `Secure` cookies on plain http://server-ip:port, which would
 * leave the user stuck on /login, so the cookie is only marked Secure on HTTPS.
 */
export function isHttpsRequest(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return request.nextUrl.protocol === "https:";
}
