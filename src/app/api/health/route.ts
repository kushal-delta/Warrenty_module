import { NextResponse } from "next/server";

/** Liveness probe for the Docker HEALTHCHECK (public, no database call). */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ status: "ok", uptime: Math.round(process.uptime()), time: new Date().toISOString() });
}
