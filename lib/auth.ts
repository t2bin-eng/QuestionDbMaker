import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "quiz_db_session";
const encoder = new TextEncoder();

export async function createSession(secret: string) {
  return new SignJWT({ role: "admin" }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("8h").sign(encoder.encode(secret));
}

export async function verifySession(token: string, secret: string) {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret));
    return payload.role === "admin";
  } catch {
    return false;
  }
}
