'use client';

import { Suspense, useMemo, useState } from 'react';
import Image from 'next/image';
import { Formik, Form } from 'formik';
import { z } from 'zod';
import { zodToFormikValidate } from '@/lib/zodFormik';
import Input from '@/components/forms/Input';
import { Button } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import api from '@/lib/api';
import { Spinner } from '@/components/ui/Loader';
import ImageKitUploader from '@/components/forms/ImageKitUploader';
import useNetwork from '@/hooks/useNetwork';
import { useSearchParams, useRouter } from 'next/navigation';

/* ---------------------------------------------
   Schemas (split by steps, then merged)
--------------------------------------------- */
const step1Schema = z.object({
  firstName: z.string().min(2, 'First name required'),
  lastName: z.string().min(2, 'Last name required'),
  email: z.email('Valid email required'),
});

const step2Schema = z.object({
  companyName: z.string().min(2, 'Company name required'),
  tenantSlug: z.string().min(3, 'At least 3 chars')
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and hyphens only'),
  plan: z.enum(['SOLO','TEAM','COMPANY']).default('SOLO'),
  brandingPrimary: z.string().regex(/^#([0-9a-f]{3}){1,2}$/i, 'Hex color like #1a73e8'),
  brandingSurface: z.string().regex(/^#([0-9a-f]{3}){1,2}$/i, 'Hex color'),
  logoUrl: z.url().optional().or(z.literal('')),
  emailFrom: z.email('Valid sender email').optional().or(z.literal('')),
});

const step3Schema = z.object({
  password: z.string().min(8, 'Min 8 characters'),
  confirmPassword: z.string().min(8),
}).refine(v => v.password === v.confirmPassword, {
  path: ['confirmPassword'], message: 'Passwords do not match'
});

// Full payload schema to submit to /signup
const signupPayloadSchema = z.object({
  tenant: z.object({
    slug: z.string(),
    plan: z.enum(['SOLO','TEAM','COMPANY']),
    name: z.string(),
  }),
  owner: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.email(),
    password: z.string(),
  }),
  branding: z.object({
    primaryColor: z.string().regex(/^#([0-9a-f]{3}){1,2}$/i),
    surfaceColor: z.string().regex(/^#([0-9a-f]{3}){1,2}$/i),
    logoUrl: z.url().optional(),
    emailFrom: z.email().optional(),
  }).partial(),
});

/* ---------------------------------------------
   Component
--------------------------------------------- */
type Step = 1|2|3|4;

function StepIndicator({ steps, currentStep }: { steps: { n: number; label: string }[]; currentStep: number }) {
  function cls(sn: number) {
    if (currentStep > sn) return 'bg-[#1a73e8] text-white';
    if (currentStep === sn) return 'bg-[#1a73e8] text-white shadow-md ring-4 ring-[#1a73e8]/20';
    return 'bg-[#e8f0fe] text-[#1a73e8]/60 border border-[#1a73e8]/20';
  }
  return (
    <div className="flex items-center justify-center gap-2 text-sm" role="navigation" aria-label="Signup progress">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <div className={`h-8 w-8 rounded-full grid place-items-center text-xs font-bold transition-all ${cls(s.n)}`}>
            {currentStep > s.n ? '\u2713' : s.n}
          </div>
          <span className={`hidden sm:block text-xs ${currentStep >= s.n ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>{s.label}</span>
          {i !== steps.length - 1 && <div className={`w-8 sm:w-12 h-0.5 rounded transition-colors ${currentStep > s.n ? 'bg-[#1a73e8]' : 'bg-[#e8f0fe]'}`} />}
        </div>
      ))}
    </div>
  );
}

function SignupWizardInner() {
  const online = useNetwork();
  const sp = useSearchParams();
  const router = useRouter();

  // If user came via email link, prefill step 4 fields
  const urlEmail = sp.get('email') || '';
  const urlTenant = sp.get('tenant') || '';
  const urlToken = sp.get('token') || '';
  // (prevState: Step) => Step | (s: Step) => number
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // Persisted values across steps
  const [values, setValues] = useState({
    // step 1
    firstName: '',
    lastName: '',
    email: '',
    // step 2
    companyName: '',
    tenantSlug: '',
    plan: 'SOLO',
    brandingPrimary: '#1a73e8',
    brandingSurface: '#f1f3f4',
    logoUrl: '',
    emailFrom: '',
    // step 3
    password: '',
    confirmPassword: '',
    // step 4 (verify)
    v_email: urlEmail,
    v_tenantSlug: urlTenant,
    v_token: urlToken,
  });

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

  // Submit (calls /signup) on step 3
  async function submitSignup() {
    setBusy(true);
    try {
      const payload = signupPayloadSchema.parse({
        tenant: {
          slug: values.tenantSlug.toLowerCase(),
          plan: values.plan as any,
          name: values.companyName,
        },
        owner: {
          firstName: values.firstName,
          lastName: values.lastName,
          email: values.email.toLowerCase(),
          password: values.password,
        },
        branding: {
          primaryColor: values.brandingPrimary,
          surfaceColor: values.brandingSurface,
          logoUrl: values.logoUrl || undefined,
          emailFrom: values.emailFrom || undefined,
        }
      });

      const { data } = await api.post('/api/v1/auth/signup', payload);
      // Autofill verify step with returned tenant slug + email
      setValues(v => ({
        ...v,
        v_email: data?.owner?.email || v.email,
        v_tenantSlug: data?.tenant?.slug || v.tenantSlug
      }));
      setStep(4);
    } catch (e:any) {
      setErr(e?.response?.data?.error || 'Signup failed');
      setModalOpen(true);
    } finally {
      setBusy(false);
    }
  }

  // Verify email
  async function verifyNow() {
    setBusy(true);
    try {
      await api.post('/api/v1/auth/verify', {
        email: values.v_email,
        tenantSlug: values.v_tenantSlug,
        token: values.v_token
      });
      // After verification, send them to signin with prefilled tenant
      router.replace(`/signin?tenant=${encodeURIComponent(values.v_tenantSlug)}&email=${encodeURIComponent(values.v_email)}`);
    } catch (e:any) {
      setErr(e?.response?.data?.error || 'Verification failed');
      setModalOpen(true);
    } finally {
      setBusy(false);
    }
  }

  // Resend email
  async function resendEmail() {
    setBusy(true);
    try {
      await api.post('/api/v1/auth/resend', {
        tenantSlug: values.v_tenantSlug,
        email: values.v_email
      });
      setErr('Verification email re-sent. Check your inbox.');
      setModalOpen(true);
    } catch (e:any) {
      setErr(e?.response?.data?.error || 'Could not resend email');
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
        <Image src="/icon-192.png" alt="TRES CRM" width={56} height={56} className="mx-auto mb-4 rounded-2xl" priority />
        <h1 className="text-2xl font-bold">Create your workspace</h1>
        <p className="text-gray-500 text-sm mt-1">Set up your TRES CRM account in minutes</p>
      </div>

      {/* Stepper */}
      <StepIndicator steps={steps} currentStep={step} />

      {/* Card */}
      <div className="rounded-2xl border bg-white shadow-sm p-6">
        {step<=3 ? (
          <Formik
            enableReinitialize
            initialValues={values}
            validate={currentValidate}
            onSubmit={async (vals) => {
              setValues(vals);
              if (step < 3) next(); else await submitSignup();
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
                          value={v.plan}
                          onChange={e=>setFieldValue('plan', e.target.value)}
                          className="h-10 px-3 rounded-md border w-full"
                        >
                          <option value="SOLO">Solo</option>
                          <option value="TEAM">Team</option>
                          <option value="COMPANY">Company</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label htmlFor="brandingPrimary" className="text-sm font-medium text-gray-700">Primary color</label>
                        <div className="flex items-center gap-2">
                          <input
                            id="brandingPrimary"
                            type="color"
                            value={v.brandingPrimary}
                            onChange={e => setFieldValue('brandingPrimary', e.target.value)}
                            className="h-10 w-12 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                            aria-label="Pick primary brand color"
                          />
                          <input
                            type="text"
                            value={v.brandingPrimary}
                            onChange={e => setFieldValue('brandingPrimary', e.target.value)}
                            className="h-10 px-3 rounded-md border w-full font-mono text-sm"
                            placeholder="#1a73e8"
                            maxLength={7}
                          />
                        </div>
                        <p className="text-xs text-gray-400">Used for buttons, links, and accents</p>
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="brandingSurface" className="text-sm font-medium text-gray-700">Surface color</label>
                        <div className="flex items-center gap-2">
                          <input
                            id="brandingSurface"
                            type="color"
                            value={v.brandingSurface}
                            onChange={e => setFieldValue('brandingSurface', e.target.value)}
                            className="h-10 w-12 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                            aria-label="Pick surface background color"
                          />
                          <input
                            type="text"
                            value={v.brandingSurface}
                            onChange={e => setFieldValue('brandingSurface', e.target.value)}
                            className="h-10 px-3 rounded-md border w-full font-mono text-sm"
                            placeholder="#f1f3f4"
                            maxLength={7}
                          />
                        </div>
                        <p className="text-xs text-gray-400">Used for card and panel backgrounds</p>
                      </div>
                    </div>

                    {/* Live preview */}
                    <div className="rounded-lg border p-3 space-y-2">
                      <p className="text-xs font-medium text-gray-500">Preview</p>
                      <div className="flex items-center gap-3">
                        <div className="h-8 px-4 rounded-md text-white text-xs font-medium flex items-center" style={{ backgroundColor: v.brandingPrimary }}>Button</div>
                        <div className="h-8 px-4 rounded-md text-xs font-medium flex items-center border" style={{ backgroundColor: v.brandingSurface, color: v.brandingPrimary }}>Card</div>
                        <span className="text-xs underline" style={{ color: v.brandingPrimary }}>Link text</span>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-sm text-gray-700">Logo</label>
                        <ImageKitUploader onUploaded={(files)=> setFieldValue('logoUrl', files[0]?.url || '')} />
                        {v.logoUrl && <img src={v.logoUrl} alt="logo" className="h-10 mt-2" />}
                      </div>
                      <Input name="emailFrom" label="Emails from (optional)" placeholder="support@yourdomain.com" />
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <Input name="password" type="password" label="Password" placeholder="••••••••" />
                    <Input name="confirmPassword" type="password" label="Confirm password" placeholder="••••••••" />
                  </>
                )}

                <div className="flex items-center justify-between pt-2">
                  <Button variant="outline" type="button" onClick={back} disabled={step===1 || isSubmitting || !online}>
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
              <p className="text-sm text-gray-700">
                We sent a verification email to <strong>{values.v_email || values.email}</strong>.
              </p>
              <p className="text-xs text-gray-500 mt-1">Click the link in the email, or paste the code below.</p>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm text-gray-700">Workspace (tenant slug)</label>
                <input
                  className="h-10 px-3 rounded-xl border w-full"
                  value={values.v_tenantSlug}
                  onChange={e=>setValues(v=>({...v, v_tenantSlug: e.target.value}))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-gray-700">Email</label>
                <input
                  className="h-10 px-3 rounded-xl border w-full"
                  type="email"
                  value={values.v_email}
                  onChange={e=>setValues(v=>({...v, v_email: e.target.value}))}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm text-gray-700">Verification token</label>
              <input
                className="h-10 px-3 rounded-xl border w-full"
                value={values.v_token}
                onChange={e=>setValues(v=>({...v, v_token: e.target.value}))}
                placeholder="Paste token from email"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="outline" onClick={()=>setStep(3)} disabled={busy || !online}>Back</Button>
              <div className="flex items-center gap-2">
                {busy && <Spinner />}
                <Button variant="outline" onClick={resendEmail} disabled={busy || !online}>Resend email</Button>
                <Button onClick={verifyNow} disabled={busy || !online}>I’ve verified</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error/Info modal */}
      <Modal open={modalOpen} onClose={()=>setModalOpen(false)} title="Notice" footer={
        <Button variant="outline" onClick={()=>setModalOpen(false)}>Close</Button>
      }>
        <p className="text-sm">{err}</p>
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
