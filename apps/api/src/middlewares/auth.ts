import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/auth";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const hdr = req.header("Authorization");
  if (!hdr?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = verifyToken(hdr.slice(7));
    (req as any).auth = payload; // sub, tid, roles
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRoles(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth as { roles: string[] } | undefined;
    if (!auth) return res.status(401).json({ error: "Unauthorized" });
    const ok = roles.some(r => auth.roles.includes(r));
    return ok ? next() : res.status(403).json({ error: "Forbidden" });
  };
}
