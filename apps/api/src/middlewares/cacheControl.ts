import type { Request, Response, NextFunction } from "express";

/** Sets Cache-Control: public with the given max-age in seconds. */
export const cachePublic = (seconds: number) =>
  (_req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", `public, max-age=${seconds}, s-maxage=${seconds}`);
    next();
  };

/** Sets Cache-Control: private with the given max-age in seconds. */
export const cachePrivate = (seconds: number) =>
  (_req: Request, res: Response, next: NextFunction) => {
    res.set("Cache-Control", `private, max-age=${seconds}`);
    next();
  };

/** Sets Cache-Control: no-store, no-cache, must-revalidate. */
export const noCache = (_req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  next();
};
