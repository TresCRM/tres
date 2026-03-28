'use client';

import { Formik, Form } from 'formik';
import { z } from 'zod';
import Input from '@/components/forms/Input';
import { zodToFormikValidate } from '@/lib/zodFormik';
import ImageKitUploader from '@/components/forms/ImageKitUploader';
import api from '@/lib/api';
import { Button } from '@/components/ui/Button';

const schema = z.object({
  primary: z.string().regex(/^#([0-9a-f]{3}){1,2}$/i, 'Hex color'),
  appName: z.string().min(2),
  logoUrl: z.url().optional(),
});

export default function Branding() {
  return (
    <div className="max-w-xl">
      <h2 className="text-xl font-semibold mb-4">Branding</h2>
      <Formik
        initialValues={{ primary:'#1a73e8', appName:'TRES CRM', logoUrl:'' }}
        validate={zodToFormikValidate(schema)}
        onSubmit={async (values, { setSubmitting }) => {
          // Save to API → tenants.branding
          await api.put('/tenants/me/branding', values);
          // Apply CSS var immediately
          document.documentElement.style.setProperty('--brand-primary',
            `${parseInt(values.primary.slice(1,3),16)} ${parseInt(values.primary.slice(3,5),16)} ${parseInt(values.primary.slice(5,7),16)}`
          );
          setSubmitting(false);
        }}
      >
        {({ values, setFieldValue, isSubmitting }) => (
          <Form className="space-y-4">
            <Input name="appName" label="App display name" placeholder="Acme Support" />
            <Input name="primary" label="Primary color (hex)" placeholder="#1a73e8" />
            <div className="space-y-1">
              <label className="text-sm text-gray-700">Logo</label>
              <ImageKitUploader onUploaded={(f)=> setFieldValue('logoUrl', f[0]?.url)} />
              {values.logoUrl && <img src={values.logoUrl} alt="logo" className="h-10 mt-2" />}
            </div>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
          </Form>
        )}
      </Formik>
    </div>
  );
}
