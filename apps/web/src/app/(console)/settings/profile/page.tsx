'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCurrentUser, useUpdateProfile } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { User, Save, CheckCircle, AlertCircle } from 'lucide-react';

interface ProfileForm {
  firstName: string;
  lastName: string;
}

export default function ProfilePage() {
  const { data: me, isLoading } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const { user } = useAuthStore();
  const [saved, setSaved] = useState(false);

  const { register, handleSubmit, reset, formState: { errors, isDirty, isSubmitting } } = useForm<ProfileForm>();

  // Populate form when /me data loads
  useEffect(() => {
    if (me) {
      reset({ firstName: me.firstName || '', lastName: me.lastName || '' });
    }
  }, [me, reset]);

  async function onSubmit(data: ProfileForm) {
    try {
      await updateProfile.mutateAsync(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Profile</h1>
        <div className="animate-pulse space-y-3">
          <div className="h-10 bg-gray-100 rounded-md w-1/2" />
          <div className="h-10 bg-gray-100 rounded-md w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-full bg-[var(--brand-primary,#4F46E5)]/10 flex items-center justify-center">
          <User size={20} className="text-[var(--brand-primary,#4F46E5)]" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-sm text-gray-500">Update your personal information</p>
        </div>
      </div>

      {/* Read-only info */}
      <div className="border rounded-xl p-5 bg-white shadow-sm mb-6 space-y-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Email</p>
          <p className="text-sm font-medium mt-0.5">{me?.email || user?.email || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Roles</p>
          <div className="flex gap-1.5 mt-1">
            {(me?.roles || user?.roles || []).map((r: string) => (
              <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 font-medium">{r}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Editable form */}
      <form onSubmit={handleSubmit(onSubmit)} className="border rounded-xl p-5 bg-white shadow-sm space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="firstName" className="text-sm font-medium text-gray-700">First name</label>
            <input
              id="firstName"
              {...register('firstName', { required: 'First name required', minLength: { value: 1, message: 'Required' } })}
              className={`h-10 px-3 rounded-md border w-full text-sm ${errors.firstName ? 'border-red-300' : ''}`}
            />
            {errors.firstName && <p className="text-xs text-red-500">{errors.firstName.message}</p>}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="lastName" className="text-sm font-medium text-gray-700">Last name</label>
            <input
              id="lastName"
              {...register('lastName', { required: 'Last name required', minLength: { value: 1, message: 'Required' } })}
              className={`h-10 px-3 rounded-md border w-full text-sm ${errors.lastName ? 'border-red-300' : ''}`}
            />
            {errors.lastName && <p className="text-xs text-red-500">{errors.lastName.message}</p>}
          </div>
        </div>

        {updateProfile.isError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
            <AlertCircle size={16} />
            {(updateProfile.error as any)?.response?.data?.details || 'Failed to update profile'}
          </div>
        )}

        {saved && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            <CheckCircle size={16} />
            Profile updated successfully
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!isDirty || isSubmitting || updateProfile.isPending}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 min-h-[44px]"
          >
            <Save size={16} />
            {updateProfile.isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
