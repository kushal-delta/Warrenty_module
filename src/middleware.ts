import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { readAuthToken } from "@/lib/auth/token";
import { verifyAuthToken } from "@/lib/auth/jwt";
import { canUseApi, canUseForm, formForPath } from "@/lib/auth/forms";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Skip public assets and static files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // 2. Allow public auth endpoints and upload streaming path (RULES §50)
  if (
    pathname === "/login" ||
    pathname === "/api/Auth/login" ||
    pathname === "/api/upload/local"
  ) {
    return NextResponse.next();
  }

  // 3. Verify session
  const token = readAuthToken(request);
  const user = token ? await verifyAuthToken(token) : null;

  // 4. Handle unauthenticated requests
  if (!user) {
    // RULES §49: API request is answered with 401 JSON, never redirected
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHENTICATED" },
        { status: 401 }
      );
    }
    // Web app page routes redirect to /login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 5. Screen (form) rights — APIs answer 403, pages go back to the dashboard with a notice
  if (pathname.startsWith("/api/")) {
    if (!canUseApi(user, pathname, request.method)) {
      return NextResponse.json(
        { error: "You do not have rights to this screen. Ask your administrator for access.", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
  } else {
    const form = formForPath(pathname);
    if (form && !canUseForm(user, form.key)) {
      const home = new URL("/", request.url);
      home.searchParams.set("denied", form.label);
      return NextResponse.redirect(home);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and _next
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
