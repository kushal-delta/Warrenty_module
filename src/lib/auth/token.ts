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
