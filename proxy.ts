import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/login") || request.nextUrl.pathname.startsWith("/api/auth")) return NextResponse.next();
  const secret = process.env.AUTH_SECRET;
  if (!secret) return NextResponse.next();
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !(await verifySession(token, secret))) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
