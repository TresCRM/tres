export class AppError extends Error {
  status: number; code: string; details?: any;
  constructor(status: number, code: string, message?: string, details?: any) {
    super(message ?? code);
    this.status = status; this.code = code; this.details = details;
  }
}
export const ERR = {
  BAD_REQUEST: (code='bad_request', details?:any)=> new AppError(400, code, undefined, details),
  UNAUTHORIZED: ()=> new AppError(401,'unauthorized'),
  FORBIDDEN: ()=> new AppError(403,'forbidden'),
  CONFLICT: (code='conflict')=> new AppError(409, code),
  NOT_FOUND: (code='not_found')=> new AppError(404, code),
  PAYMENT_REQUIRED: (code='payment_required')=> new AppError(402, code),
  INTERNAL: ()=> new AppError(500, 'internal_error')
} as const;

export const MSG = {
  EMAIL_TAKEN: 'Email already used in this tenant',
  TENANT_SLUG_TAKEN: 'Tenant slug already exists',
  INVALID_LOGIN: 'Invalid email or password'
} as const;
