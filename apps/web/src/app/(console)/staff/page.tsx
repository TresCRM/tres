'use client';

import { useState } from 'react';
import { useUsers, useInviteUser } from '@/hooks/useApi';
import { useForm } from 'react-hook-form';
import RoleGuard from '@/components/guards/RoleGuard';
import { normalizeFormData, nameRules, emailRules } from '@/lib/validation';
import { Loader2 } from 'lucide-react';

export default function StaffPage() {
  const { data, isLoading } = useUsers();
  const inviteMutation = useInviteUser();
  const [showInvite, setShowInvite] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    firstName: string; lastName: string; email: string; roles: string[];
  }>();

  const onSubmit = async (formData: any) => {
    const roles = [formData.role];
    await inviteMutation.mutateAsync(normalizeFormData({ ...formData, roles }));
    setShowInvite(false);
    reset();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Staff</h1>
          {data?.seats && (
            <p className="text-sm text-gray-500 mt-1">
              {data.seats.used} of {data.seats.total} seats used
            </p>
          )}
        </div>
        <RoleGuard roles={['OWNER', 'ADMIN']}>
          <button onClick={() => setShowInvite(!showInvite)} className="px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px]">
            {showInvite ? 'Cancel' : '+ Invite User'}
          </button>
        </RoleGuard>
      </div>

      {showInvite && (
        <form onSubmit={handleSubmit(onSubmit)} className="border rounded-xl p-4 mb-6 bg-white shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="inv-fn" className="block text-sm font-medium mb-1">First Name *</label>
              <input id="inv-fn" {...register('firstName', nameRules)} aria-invalid={!!errors.firstName} aria-describedby={errors.firstName ? 'firstName-err' : undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
              {errors.firstName && <p id="firstName-err" role="alert" className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
            </div>
            <div>
              <label htmlFor="inv-ln" className="block text-sm font-medium mb-1">Last Name *</label>
              <input id="inv-ln" {...register('lastName', nameRules)} aria-invalid={!!errors.lastName} aria-describedby={errors.lastName ? 'lastName-err' : undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
              {errors.lastName && <p id="lastName-err" role="alert" className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
            </div>
            <div>
              <label htmlFor="inv-email" className="block text-sm font-medium mb-1">Email *</label>
              <input id="inv-email" type="email" {...register('email', emailRules)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
              {errors.email && <p id="email-err" role="alert" className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="inv-role" className="block text-sm font-medium mb-1">Role *</label>
              <select id="inv-role" {...register('role' as any, { required: 'Required' })} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="AGENT">Agent</option>
                <option value="ADMIN">Admin</option>
                <option value="BILLING">Billing</option>
                <option value="READONLY">Read Only</option>
              </select>
            </div>
          </div>
          <button type="submit" disabled={inviteMutation.isPending} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px]">
            {inviteMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Inviting...</> : 'Send Invite'}
          </button>
          {inviteMutation.isError && <p className="text-red-500 text-sm" role="alert">Failed to invite user. They may already exist or seat limit reached.</p>}
        </form>
      )}

      {isLoading && <p className="text-gray-500" role="status">Loading...</p>}
      {data?.data && (
        <div className="border rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm" role="table">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600" scope="col">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell" scope="col">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" scope="col">Roles</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600" scope="col">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.data.map((u: any) => (
                <tr key={u._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{u.firstName} {u.lastName}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles?.map((r: string) => (
                        <span key={r} className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      u.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                      u.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>{u.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
