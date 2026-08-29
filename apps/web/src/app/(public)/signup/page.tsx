'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Formik, Form } from 'formik';
import { z } from 'zod';
import { zodToFormikValidate } from '@/lib/zodFormik';
import Input from '@/components/forms/Input';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import api from '@/lib/api';
import { Spinner } from '@/components/ui/Loader';
import LogoUploader from '@/components/forms/LogoUploader';
import useNetwork from '@/hooks/useNetwork';
import { useSearchParams, useRouter } from 'next/navigation';

/* ---------------------------------------------
   Step validation schemas — lightweight, only block
   navigation on truly required fields.
   Full server-aligned validation runs at submit time.
   Server: password min 10, uppercase+lowercase+digit
   Server: plan enum INDIVIDUAL | COMPANY
--------------------------------------------- */
const VALID_PLANS = ['INDIVIDUAL', 'COMPANY'] as const;

const step1Schema = z.object({
  firstName: z.string().min(2, 'First name required'),
  lastName: z.string().min(2, 'Last name required'),
  email: z.email('Valid email required'),
});

const step2Schema = z.object({
  companyName: z.string().min(2, 'Company name required'),
  tenantSlug: z.string().min(3, 'At least 3 chars')
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and hyphens only'),
});

const step3Schema = z.object({
  password: z.string()
    .min(10, 'Password must be at least 10 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Must contain at least one digit'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine(v => v.password === v.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords do not match'
});

/* ---------------------------------------------
   Server error parser — turns API error responses
   into human-readable messages
--------------------------------------------- */
const ERROR_MESSAGES: Record<string, string> = {
  tenant_slug_taken: 'This workspace URL is already taken. Please choose a different one.',
  invalid_request: 'Some fields are invalid. Please check and try again.',
  email_already_exists: 'An account with this email already exists.',
  tenant_not_found: 'Workspace not found. Please check the slug.',
  token_invalid: 'Verification token is invalid or has expired.',
  token_expired: 'Verification token has expired. Please request a new one.',
};

function parseServerError(e: any): string {
  const data = e?.response?.data;
  if (!data) return e?.message || 'Something went wrong. Please try again.';

  const code = data.error;
  const details = data.details;

  // If server returned a Zod validation error in details, parse it
  if (details && typeof details === 'string') {
    try {
      const parsed = JSON.parse(details);
      if (Array.isArray(parsed)) {
        // Zod error array: [{ path: ['owner','password'], message: '...' }, ...]
        return parsed
          .map((issue: any) => {
            const field = issue.path?.slice(-1)[0];
            const label = field ? `${field}: ` : '';
            return `${label}${issue.message}`;
          })
          .join('\n');
      }
    } catch {
      // details is a plain string message, use it directly
      return details;
    }
  }

  return ERROR_MESSAGES[code] || code?.replace(/_/g, ' ') || 'Something went wrong. Please try again.';
}

/* ---------------------------------------------
   Color Picker with hex paste support
--------------------------------------------- */
function ColorPickerField({ id, label, value, onChange, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
  const [hexInput, setHexInput] = useState(value);
  const [valid, setValid] = useState(true);
  const hexRegex = /^#([0-9a-fA-F]{3}){1,2}$/;

  // Sync from parent (e.g. color picker changes)
  useEffect(() => { setHexInput(value); setValid(true); }, [value]);

  function handleTextChange(raw: string) {
    // Auto-add # prefix if user pastes without it
    let v = raw.trim();
    if (v && !v.startsWith('#')) v = '#' + v;
    setHexInput(v);

    if (hexRegex.test(v)) {
      setValid(true);
      onChange(v);
    } else {
      setValid(v.length === 0);
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text').trim();
    // If pasting a bare hex like "1a73e8" or "#1a73e8", handle it
    if (pasted) {
      e.preventDefault();
      handleTextChange(pasted);
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hexRegex.test(value) ? value : '#000000'}
          onChange={e => onChange(e.target.value)}
          className="h-10 w-12 rounded-lg border border-gray-300 cursor-pointer p-0.5 shrink-0"
          aria-label={`Pick ${label.toLowerCase()}`}
        />
        <div className="relative flex-1">
          <input
            id={id}
            type="text"
            value={hexInput}
            onChange={e => handleTextChange(e.target.value)}
            onPaste={handlePaste}
            className={`h-10 px-3 rounded-md border w-full font-mono text-sm ${!valid ? 'border-red-300 bg-red-50/50' : ''}`}
            placeholder="#1a73e8"
            maxLength={7}
            spellCheck={false}
            aria-invalid={!valid}
            aria-describedby={!valid ? `${id}-error` : undefined}
          />
          {!valid && hexInput.length > 0 && (
            <p id={`${id}-error`} className="text-xs text-red-500 mt-0.5" role="alert">Enter a valid hex color (e.g. #1a73e8)</p>
          )}
        </div>
        {/* Swatch preview */}
        <div
          className="h-10 w-10 rounded-md border shrink-0"
          style={{ backgroundColor: hexRegex.test(value) ? value : '#eee' }}
          aria-hidden="true"
        />
      </div>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
    </div>
  );
}

/* ---------------------------------------------
   Component
--------------------------------------------- */
type Step = 1|2|3|4;

function StepIndicator({ steps, currentStep, onGoTo }: { steps: { n: number; label: string }[]; currentStep: number; onGoTo?: (n: number) => void }) {
  function cls(sn: number) {
    if (currentStep > sn) return 'bg-[#1a73e8] text-white';
    if (currentStep === sn) return 'bg-[#1a73e8] text-white shadow-md ring-4 ring-[#1a73e8]/20';
    return 'bg-[#e8f0fe] text-[#1a73e8]/60 border border-[#1a73e8]/20';
  }
  return (
    <div className="flex items-center justify-center gap-2 text-sm" role="navigation" aria-label="Signup progress">
      {steps.map((s, i) => {
        const canClick = onGoTo && s.n < currentStep;
        return (
          <div key={s.n} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => canClick && onGoTo(s.n)}
              disabled={!canClick}
              className={`h-8 w-8 rounded-full grid place-items-center text-xs font-bold transition-all ${cls(s.n)} ${canClick ? 'cursor-pointer hover:ring-2 hover:ring-[#1a73e8]/40' : 'cursor-default'}`}
              aria-label={`Step ${s.n}: ${s.label}${canClick ? ' (click to go back)' : ''}`}
            >
              {currentStep > s.n ? '\u2713' : s.n}
            </button>
            <span className={`hidden sm:block text-xs ${currentStep >= s.n ? 'font-semibold text-gray-700' : 'text-gray-400'} ${canClick ? 'cursor-pointer' : ''}`} onClick={() => canClick && onGoTo(s.n)}>{s.label}</span>
            {i !== steps.length - 1 && <div className={`w-8 sm:w-12 h-0.5 rounded transition-colors ${currentStep > s.n ? 'bg-[#1a73e8]' : 'bg-[#e8f0fe]'}`} />}
          </div>
        );
      })}
    </div>
  );
}

const STORAGE_KEY = 'tres_signup_draft';

// Fields excluded from localStorage (sensitive or large)
const EXCLUDED_FIELDS = new Set(['password', 'confirmPassword', 'v_token', 'v_code']);

function loadDraft(): { step?: number; values?: Record<string, string> } {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return {};
    const draft = JSON.parse(raw);
    // Migrate stale plan values from older versions
    if (draft.values?.plan && !['INDIVIDUAL', 'COMPANY'].includes(draft.values.plan)) {
      draft.values.plan = 'INDIVIDUAL';
    }
    return draft;
  } catch { return {}; }
}

function saveDraft(step: number, values: Record<string, string>) {
  try {
    const safe: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      if (EXCLUDED_FIELDS.has(k)) continue;
      // Skip data-URL logos (too large for localStorage)
      if (k === 'logoUrl' && v.startsWith('data:')) continue;
      safe[k] = v;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step, values: safe }));
  } catch { /* quota exceeded — ignore */ }
}

function clearDraft() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

function SignupWizardInner() {
  const online = useNetwork();
  const sp = useSearchParams();
  const router = useRouter();

  // If user came via email link, prefill step 4 fields
  const urlEmail = sp.get('email') || '';
  const urlTenant = sp.get('tenant') || '';
  const urlToken = sp.get('token') || '';

  // Restore draft from localStorage (runs once on mount)
  const draft = useMemo(() => loadDraft(), []);

  const defaults = {
    firstName: '',
    lastName: '',
    email: '',
    companyName: '',
    tenantSlug: '',
    plan: 'INDIVIDUAL',
    brandingPrimary: '#1a73e8',
    brandingSurface: '#f1f3f4',
    logoUrl: '',
    emailFrom: '',
    password: '',
    confirmPassword: '',
    v_email: urlEmail,
    v_tenantSlug: urlTenant,
    v_token: urlToken,
    v_code: '',
  };

  const [step, setStep] = useState<Step>(() => {
    const saved = draft.step;
    // Don't restore past step 3 (step 4 = verify, requires fresh server state)
    if (saved && saved >= 1 && saved <= 3) return saved as Step;
    return 1;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const [values, setValues] = useState(() => ({
    ...defaults,
    // Overlay saved draft values (URL params take precedence for verify fields)
    ...draft.values,
    v_email: urlEmail || draft.values?.v_email || '',
    v_tenantSlug: urlTenant || draft.values?.v_tenantSlug || '',
    v_token: urlToken,
    v_code: '',
  }));

  // Persist to localStorage whenever values or step change
  useEffect(() => { saveDraft(step, values); }, [step, values]);

  // Simple step headers
  const steps = [
    { n:1, label:'Personal details' },
    { n:2, label:'Company & branding' },
    { n:3, label:'Security' },
    { n:4, label:'Email verification' },
  ];

  const clampStep = (n: number): Step =>
  n <= 1 ? 1 : n >= 4 ? 4 : (n as Step);

 function next() {
    setStep(s => clampStep(s + 1)); // returns Step
  }

  function back() {
    setStep(s => clampStep(s - 1)); // returns Step
  }

  // Step-specific validation schema
  const currentValidate = useMemo(()=>{
    if (step===1) return zodToFormikValidate(step1Schema);
    if (step===2) return zodToFormikValidate(step2Schema);
    if (step===3) return zodToFormikValidate(step3Schema);
    return undefined;
  }, [step]);

  // Submit (calls /signup) on step 3 — receives merged values directly
  async function submitSignupWith(vals: typeof values) {
    setBusy(true);
    try {
      // Normalise plan — guard against stale drafts with old values like "SOLO"
      const plan = VALID_PLANS.includes(vals.plan as any) ? vals.plan : 'INDIVIDUAL';

      // Build payload — only include optional fields if non-empty
      const logoUrl = vals.logoUrl && !vals.logoUrl.startsWith('data:') ? vals.logoUrl : undefined;
      const emailFrom = vals.emailFrom || undefined;

      const payload = {
        tenant: {
          slug: vals.tenantSlug.toLowerCase(),
          plan,
          name: vals.companyName,
        },
        owner: {
          firstName: vals.firstName,
          lastName: vals.lastName,
          email: vals.email.toLowerCase(),
          password: vals.password,
        },
        branding: {
          primaryColor: vals.brandingPrimary || '#1a73e8',
          surfaceColor: vals.brandingSurface || '#f1f3f4',
          ...(logoUrl ? { logoUrl } : {}),
          ...(emailFrom ? { emailFrom } : {}),
        },
      };

      const { data } = await api.post('/auth/signup', payload);
      clearDraft();
      setValues(v => ({
        ...v,
        v_email: data?.owner?.email || v.email,
        v_tenantSlug: data?.tenant?.slug || v.tenantSlug
      }));
      setStep(4);
    } catch (e:any) {
      setErr(parseServerError(e));
      setModalOpen(true);
    } finally {
      setBusy(false);
    }
  }

  // Verify email — prefers 6-digit code, falls back to magic-link token
  async function verifyNow() {
    const code = (values.v_code || '').replace(/\D/g, '');
    const token = values.v_token || '';
    if (!code && !token) {
      setErr('Please enter the 6-digit code from your email.');
      setModalOpen(true);
      return;
    }
    setBusy(true);
    try {
      const payload: any = {
        email: values.v_email,
        tenantSlug: values.v_tenantSlug,
      };
      if (code.length === 6) payload.code = code;
      else if (token) payload.token = token;

      await api.post('/auth/verify', payload);
      clearDraft();
      // After verification, send them to signin with prefilled tenant
      router.replace(`/signin?tenant=${encodeURIComponent(values.v_tenantSlug)}&email=${encodeURIComponent(values.v_email)}`);
    } catch (e:any) {
      const data = e?.response?.data || {};
      if (data.error === 'too_many_attempts') {
        const secs = data.retryAfterSeconds || 900;
        setErr(`Too many failed attempts. Please wait ${Math.ceil(secs / 60)} minute(s) or request a new code.`);
      } else if (data.remainingAttempts !== undefined) {
        setErr(`${data.message || 'Invalid code.'} ${data.remainingAttempts} attempt(s) remaining.`);
      } else {
        setErr(parseServerError(e));
      }
      setModalOpen(true);
    } finally {
      setBusy(false);
    }
  }

  // Resend email
  async function resendEmail() {
    setBusy(true);
    try {
      await api.post('/auth/resend', {
        tenantSlug: values.v_tenantSlug,
        email: values.v_email
      });
      setErr('Verification email re-sent. Check your inbox.');
      setModalOpen(true);
    } catch (e:any) {
      setErr(parseServerError(e));
      setModalOpen(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-10 space-y-6">
      {/* Offline banner */}
      {!online && (
        <div className="rounded-xl bg-red-600 text-white px-4 py-3 text-sm flex items-center gap-2" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
          You&apos;re offline. Form actions are disabled until connection is restored.
        </div>
      )}

      {/* Header */}
      <div className="text-center">
        <Image src="/logo-md.png" alt="TRES CRM" width={72} height={24} className="mx-auto mb-4" priority />
        <h1 className="text-2xl font-bold">Create your workspace</h1>
        <p className="text-gray-500 text-sm mt-1">Set up your TRES CRM account in minutes</p>
      </div>

      {/* Stepper */}
      <StepIndicator steps={steps} currentStep={step} onGoTo={n => setStep(clampStep(n))} />

      {/* Card */}
      <div className="rounded-2xl border bg-white shadow-sm p-6">
        {step<=3 ? (
          <Formik
            enableReinitialize
            initialValues={values}
            validate={currentValidate}
            onSubmit={async (vals) => {
              // Sync Formik snapshot → outer state before acting
              const merged = { ...values, ...vals };
              setValues(merged);
              if (step < 3) {
                next();
              } else {
                // Pass merged values directly so submitSignup sees them immediately
                await submitSignupWith(merged);
              }
            }}
          >
            {({ values: v, setFieldValue, isSubmitting }) => (
              <Form className="space-y-4">
                {step === 1 && (
                  <>
                    <Input name="firstName" label="First name" placeholder="Ada" />
                    <Input name="lastName" label="Last name" placeholder="Lovelace" />
                    <Input name="email" label="Work email" placeholder="you@company.com" />
                  </>
                )}

                {step === 2 && (
                  <>
                    <Input name="companyName" label="Company / Workspace name" placeholder="Acme Support" />
                    <div className="grid md:grid-cols-2 gap-3">
                      <Input name="tenantSlug" label="Workspace URL (slug)" placeholder="acme-support" />
                      <div className="space-y-1">
                        <label className="text-sm text-gray-700">Plan</label>
                        <select
                          name="plan"
                          value={VALID_PLANS.includes(v.plan as any) ? v.plan : 'INDIVIDUAL'}
                          onChange={e=>setFieldValue('plan', e.target.value)}
                          className="h-10 px-3 rounded-md border w-full"
                        >
                          <option value="INDIVIDUAL">Individual</option>
                          <option value="COMPANY">Company</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      <ColorPickerField
                        id="brandingPrimary"
                        label="Primary color"
                        value={v.brandingPrimary}
                        onChange={val => setFieldValue('brandingPrimary', val)}
                        hint="Buttons, links, and accents"
                      />
                      <ColorPickerField
                        id="brandingSurface"
                        label="Surface color"
                        value={v.brandingSurface}
                        onChange={val => setFieldValue('brandingSurface', val)}
                        hint="Card and panel backgrounds"
                      />
                    </div>

                    {/* Live preview */}
                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-xs font-medium text-gray-500">Preview</p>
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="h-8 px-4 rounded-md text-white text-xs font-medium flex items-center" style={{ backgroundColor: v.brandingPrimary }}>Button</div>
                        <div className="h-8 px-4 rounded-md text-xs font-medium flex items-center border" style={{ backgroundColor: v.brandingSurface, color: v.brandingPrimary }}>Card</div>
                        <span className="text-xs underline" style={{ color: v.brandingPrimary }}>Link text</span>
                        <div className="h-8 px-3 rounded-md text-xs flex items-center border" style={{ backgroundColor: v.brandingSurface }}>
                          <span style={{ color: v.brandingPrimary }}>&#9679;</span>
                          <span className="ml-1.5 text-gray-600">Badge</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3 items-start">
                      <LogoUploader
                        value={v.logoUrl}
                        onChange={url => setFieldValue('logoUrl', url)}
                      />
                      <Input name="emailFrom" label="Emails from (optional)" placeholder="support@yourdomain.com" />
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <Input name="password" type="password" label="Password" placeholder="••••••••••" />
                    <p className="text-xs text-gray-400 -mt-2">Min 10 characters, with at least one uppercase, one lowercase, and one digit.</p>
                    <Input name="confirmPassword" type="password" label="Confirm password" placeholder="••••••••••" />
                  </>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" type="button" onClick={() => { setValues(prev => ({ ...prev, ...v })); back(); }} disabled={step===1 || isSubmitting || !online}>
                    Back
                  </Button>
                  <div className="flex items-center gap-2">
                    {busy && <Spinner />}
                    <Button type="submit" disabled={isSubmitting || busy || !online}>
                      {step !== 3 ? 'Continue' : (busy ? 'Creating…' : 'Create workspace')}
                    </Button>
                  </div>
                </div>
              </Form>
            )}
          </Formik>
        ) : (
          <div className="space-y-5">
            <div className="text-center pb-2">
              <div className="w-12 h-12 bg-[#e8f0fe] rounded-full flex items-center justify-center mx-auto mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--brand-primary,#4F46E5)" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">Check your email</h2>
              <p className="text-sm text-gray-700 mt-1">
                We sent a 6-digit code to <strong>{values.v_email || values.email}</strong>.
              </p>
              <p className="text-xs text-gray-500 mt-1">Enter the code below, or click the link in the email.</p>
            </div>

            {/* 6-box OTP input */}
            <div className="space-y-2">
              <label className="text-sm text-gray-700 block text-center">Verification code</label>
              <div className="flex justify-center gap-2" onPaste={(e) => {
                const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                if (pasted.length >= 4) {
                  e.preventDefault();
                  setValues(v => ({ ...v, v_code: pasted.padEnd(6, '') }));
                  // Auto-submit if pasted code is complete
                  if (pasted.length === 6) setTimeout(() => verifyNow(), 50);
                }
              }}>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <input
                    key={i}
                    id={`otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    className="w-12 h-14 text-center text-xl font-mono font-semibold rounded-lg border-2 border-gray-300 focus:border-[var(--brand-primary,#4F46E5)] focus:outline-none"
                    value={values.v_code[i] || ''}
                    onChange={(e) => {
                      const digit = e.target.value.replace(/\D/g, '').slice(-1);
                      const next = (values.v_code || '').padEnd(6, ' ').split('');
                      next[i] = digit;
                      const updated = next.join('').trimEnd();
                      setValues(v => ({ ...v, v_code: updated }));
                      // Auto-advance
                      if (digit && i < 5) {
                        const nextInput = document.getElementById(`otp-${i + 1}`);
                        (nextInput as HTMLInputElement)?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      // Backspace on empty box goes to previous
                      if (e.key === 'Backspace' && !values.v_code[i] && i > 0) {
                        const prevInput = document.getElementById(`otp-${i - 1}`);
                        (prevInput as HTMLInputElement)?.focus();
                      }
                    }}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>
              <p className="text-xs text-gray-400 text-center">Paste the code to auto-fill all boxes</p>
            </div>

            <div className="flex items-center justify-between pt-2 gap-2">
              <Button variant="outline" onClick={()=>setStep(3)} disabled={busy || !online}>Back</Button>
              <div className="flex items-center gap-2">
                {busy && <Spinner />}
                <Button variant="outline" onClick={resendEmail} disabled={busy || !online}>Resend</Button>
                <Button
                  onClick={verifyNow}
                  disabled={busy || !online || (values.v_code || '').replace(/\D/g, '').length !== 6}
                >
                  Verify
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error/Info modal */}
      <Modal open={modalOpen} onClose={()=>setModalOpen(false)} title="Notice" footer={
        <Button variant="outline" onClick={()=>setModalOpen(false)}>Close</Button>
      }>
        <div className="text-sm space-y-1">
          {err?.split('\n').map((line, i) => (
            <p key={i} className={err?.includes(':') && i > 0 ? 'text-gray-600' : ''}>{line}</p>
          ))}
        </div>
      </Modal>
    </section>
  );
}

export default function SignupWizard() {
  return (
    <Suspense fallback={
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center" role="status" aria-label="Loading signup form">
        <div className="text-center">
          <div className="w-14 h-14 bg-[#e8f0fe] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <div className="animate-spin h-7 w-7 border-3 border-gray-300 border-t-[var(--brand-primary,#4F46E5)] rounded-full" />
          </div>
          <p className="text-sm text-gray-500">Loading signup...</p>
        </div>
      </div>
    }>
      <SignupWizardInner />
    </Suspense>
  );
}
