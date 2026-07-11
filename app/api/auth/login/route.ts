import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSession, SESSION_COOKIE } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";

const attempts = new Map<string, { count: number; resetAt: number }>();
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (!env.success) return NextResponse.json({ message: "서버 환경 변수가 설정되지 않았습니다." }, { status: 503 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  const now = Date.now(); const current = attempts.get(ip);
  if (current && current.resetAt > now && current.count >= 5) return NextResponse.json({ message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, { status: 429 });
  const body = await request.json().catch(() => ({})); const supplied = typeof body.password === "string" ? body.password : "";
  const a = Buffer.from(supplied); const b = Buffer.from(env.data.APP_ADMIN_PASSWORD);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  if (!valid) { attempts.set(ip, { count: (current?.resetAt ?? 0) > now ? current!.count + 1 : 1, resetAt: now + 60_000 }); return NextResponse.json({ message: "비밀번호가 올바르지 않습니다." }, { status: 401 }); }
  attempts.delete(ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, await createSession(env.data.AUTH_SECRET), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: 60 * 60 * 8, path: "/" });
  return response;
}
