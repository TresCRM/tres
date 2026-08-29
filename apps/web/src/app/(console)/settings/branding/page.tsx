'use client';

import { useBranding, useUpdateBranding } from '@/hooks/useApi';
import { useForm } from 'react-hook-form';
import { useEffect } from 'react';
import { normalizeFormData, hexColorRules, urlRules, emailRules } from '@/lib/validation';
import { Loader2 } from 'lucide-react';

export default function BrandingPage() {
  const { data, isLoading } = useBranding();
  const updateMutation = useUpdateBranding();

  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<{
    name: string; primaryColor: string; surfaceColor: string; logoUrl: string; emailFrom: string;
  }>();

  useEffect(() => {
    if (data?.branding) {
      reset({
        name: data.branding.name || '',
        primaryColor: data.branding.primaryColor || '#4F46E5',
        surfaceColor: data.branding.surfaceColor || '#F3F4F6',
        logoUrl: data.branding.logoUrl || '',
        emailFrom: data.branding.emailFrom || '',
      });
    }
  }, [data, reset]);

  const onSubmit = async (formData: any) => {
    const changes: any = {};
    if (formData.name) changes.name = formData.name;
    if (formData.primaryColor) changes.primaryColor = formData.primaryColor;
    if (formData.surfaceColor) changes.surfaceColor = formData.surfaceColor;
    if (formData.logoUrl) changes.logoUrl = formData.logoUrl;
    if (formData.emailFrom) changes.emailFrom = formData.emailFrom;
    await updateMutation.mutateAsync(normalizeFormData(changes, ['emailFrom']));
  };

  if (isLoading) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Branding Settings</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="max-w-lg space-y-4">
        <div>
          <label htmlFor="brand-name" className="block text-sm font-medium mb-1">Display Name</label>
          <input id="brand-name" {...register('name')} className="w-full border rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="brand-primary" className="block text-sm font-medium mb-1">Primary Color</label>
            <div className="flex gap-2 items-center">
              <input id="brand-primary" type="color" {...register('primaryColor', hexColorRules)} className="h-10 w-10 rounded border cursor-pointer" aria-invalid={!!errors.primaryColor} />
              <input {...register('primaryColor', hexColorRules)} className="flex-1 border rounded-md px-3 py-2 text-sm" placeholder="#4F46E5" aria-invalid={!!errors.primaryColor} />
            </div>
          </div>
          <div>
            <label htmlFor="brand-surface" className="block text-sm font-medium mb-1">Surface Color</label>
            <div className="flex gap-2 items-center">
              <input id="brand-surface" type="color" {...register('surfaceColor', hexColorRules)} className="h-10 w-10 rounded border cursor-pointer" aria-invalid={!!errors.surfaceColor} />
              <input {...register('surfaceColor', hexColorRules)} className="flex-1 border rounded-md px-3 py-2 text-sm" placeholder="#F3F4F6" aria-invalid={!!errors.surfaceColor} />
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="brand-logo" className="block text-sm font-medium mb-1">Logo URL</label>
          <input id="brand-logo" type="url" {...register('logoUrl', urlRules)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="https://cdn.example.com/logo.png" aria-invalid={!!errors.logoUrl} />
        </div>
        <div>
          <label htmlFor="brand-email" className="block text-sm font-medium mb-1">Email From</label>
          <input id="brand-email" type="email" {...register('emailFrom', emailRules)} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="support@yourcompany.com" aria-invalid={!!errors.emailFrom} />
        </div>
        <button type="submit" disabled={updateMutation.isPending || !isDirty} className="px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px] disabled:opacity-50 flex items-center gap-2">
          {updateMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : 'Save Changes'}
        </button>
        {updateMutation.isSuccess && <p className="text-green-600 text-sm">Saved!</p>}
        {updateMutation.isError && <p className="text-red-500 text-sm" role="alert">Failed to save</p>}
      </form>
    </div>
  );
}
