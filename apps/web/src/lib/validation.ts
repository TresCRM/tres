/**
 * @module lib/validation
 * Shared validation patterns, normalization, and form utilities.
 * Used across all forms for consistent input handling.
 */

// ─── Email validation regex (RFC 5322 simplified) ──────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailRules = {
  required: 'Email is required',
  pattern: { value: EMAIL_RE, message: 'Please enter a valid email address' },
};

// ─── Common validation rules for react-hook-form ───────────

export const nameRules = {
  required: 'This field is required',
  minLength: { value: 1, message: 'Cannot be empty' },
  maxLength: { value: 200, message: 'Too long (max 200 characters)' },
};

export const subjectRules = {
  required: 'Subject is required',
  minLength: { value: 3, message: 'Subject must be at least 3 characters' },
  maxLength: { value: 200, message: 'Subject is too long (max 200)' },
};

export const bodyRules = {
  required: 'Description is required',
  minLength: { value: 1, message: 'Cannot be empty' },
};

export const passwordRules = {
  required: 'Password is required',
  minLength: { value: 10, message: 'Password must be at least 10 characters' },
};

export const hexColorRules = {
  pattern: { value: /^#[0-9a-fA-F]{6}$/, message: 'Must be a hex color (e.g. #4F46E5)' },
};

export const urlRules = {
  pattern: { value: /^https?:\/\/.+/, message: 'Must be a valid URL (https://...)' },
};

export const slugRules = {
  required: 'Workspace slug is required',
  pattern: { value: /^[a-z0-9-]+$/, message: 'Only lowercase letters, numbers, and hyphens' },
  minLength: { value: 3, message: 'Must be at least 3 characters' },
  maxLength: { value: 50, message: 'Too long (max 50 characters)' },
};

// ─── Input normalization ───────────────────────────────────

/** Trim whitespace and collapse multiple spaces */
export function trimInput(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Normalize email: trim + lowercase */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Normalize slug: trim + lowercase + replace spaces with hyphens */
export function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Normalize all string values in a form data object.
 * Emails are lowercased, everything else is trimmed.
 */
export function normalizeFormData<T extends Record<string, any>>(data: T, emailFields: string[] = ['email', 'customerEmail', 'emailFrom']): T {
  const result = { ...data };
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string') {
      if (emailFields.includes(key)) {
        (result as any)[key] = normalizeEmail(value);
      } else {
        (result as any)[key] = trimInput(value);
      }
    }
  }
  return result;
}
