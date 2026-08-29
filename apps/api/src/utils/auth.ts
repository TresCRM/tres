import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { createHash } from "crypto";
import { Types } from "mongoose";
import { ENV } from "../config/env";

type JWTPayload = {
  sub: string;
  tid: string;
  roles: string[];
};

export const hashPassword = (plain: string) => argon2.hash(plain);
export const verifyPassword = (plain: string, hash: string) => argon2.verify(hash, plain);

export function signAccessToken(payload: JWTPayload) {
  return jwt.sign(payload, ENV.JWT_ACCESS_SECRET, { expiresIn: ENV.ACCESS_TOKEN_TTL_SECONDS });
}

export function signRefreshToken(payload: JWTPayload) {
  return jwt.sign({ ...payload, jti: require("crypto").randomBytes(16).toString("hex") }, ENV.JWT_REFRESH_SECRET, { expiresIn: ENV.REFRESH_TOKEN_TTL_SECONDS });
}

export function verifyToken<T = JWTPayload>(token: string): T {
  return jwt.verify(token, ENV.JWT_ACCESS_SECRET) as T;
}

export function verifyRefreshToken<T = JWTPayload>(token: string): T {
  return jwt.verify(token, ENV.JWT_REFRESH_SECRET) as T;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function asObjectId(id: string) {
  return new Types.ObjectId(id);
}
