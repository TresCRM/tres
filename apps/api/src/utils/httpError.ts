import { ERR } from "../constants/errors";

export class HttpError extends Error {
  public http: number;
  public code: string;
  public details?: any;
  constructor(e: { code: string; http: number; message: string }, details?: any) {
    super(e.message);
    this.http = e.http;
    this.code = e.code;
    this.details = details;
  }
}

export const badRequest = (details?: any) => new HttpError(ERR.VALIDATION, details);
export const notFound = () => new HttpError(ERR.NOT_FOUND);
export const unauthorized = () => new HttpError(ERR.UNAUTHORIZED);
export const forbidden = () => new HttpError(ERR.FORBIDDEN);
