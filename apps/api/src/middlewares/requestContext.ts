import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

export function requestContext(req: Request, _res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  (req as any).ctx = {
    requestId,
    startedAt: new Date(start),
    ip: req.ip,
    ua: req.headers["user-agent"] || "",
  };
  resHeader(req, "x-request-id", requestId);
  (req as any).getResponseTime = () => Date.now() - start;
  next();
}

function resHeader(req: Request, name: string, value: string) {
  // responds after next() with res.on('finish'), set header now:
  (req as any).res?.setHeader?.(name, value);
}
