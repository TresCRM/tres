'use client';

import { useState } from 'react';
import { useCustomers, useCreateCustomer } from '@/hooks/useApi';
import { useForm } from 'react-hook-form';
import { useDebounce } from '@/hooks/useDebounce';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { normalizeFormData, emailRules, nameRules } from '@/lib/validation';
import { Loader2 } from 'lucide-react';

export default function CustomersPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { data, isLoading } = useCustomers({ q: debouncedSearch || undefined });
  const createMutation = useCreateCustomer();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<{
    name: string; email: string; phone?: string; company?: string;
  }>();

  const onSubmit = async (formData: any) => {
    await createMutation.mutateAsync(normalizeFormData(formData));
    toast.success('Customer created');
    setShowCreate(false);
    reset();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px]">
          {showCreate ? 'Cancel' : '+ New Customer'}
        </button>
      </div>

      <input
        type="search" placeholder="Search by name, email, company..."
        className="w-full border rounded-md px-3 py-2 text-sm mb-4 min-h-[44px]"
        value={search} onChange={e => setSearch(e.target.value)}
        aria-label="Search customers"
      />

      {showCreate && (
        <form onSubmit={handleSubmit(onSubmit)} className="border rounded-xl p-4 mb-6 bg-white shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="cust-name" className="block text-sm font-medium mb-1">Name *</label>
              <input id="cust-name" {...register('name', nameRules)} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-err' : undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
              {errors.name && <p id="name-err" role="alert" className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label htmlFor="cust-email" className="block text-sm font-medium mb-1">Email *</label>
              <input id="cust-email" type="email" {...register('email', emailRules)} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-err' : undefined} className="w-full border rounded-md px-3 py-2 text-sm" />
              {errors.email && <p id="email-err" role="alert" className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="cust-phone" className="block text-sm font-medium mb-1">Phone</label>
              <input id="cust-phone" {...register('phone')} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="cust-company" className="block text-sm font-medium mb-1">Company</label>
              <input id="cust-company" {...register('company')} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
          </div>
          <button type="submit" disabled={createMutation.isPending} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm min-h-[44px]">
            {createMutation.isPending ? <><Loader2 size={16} className="animate-spin" /> Creating...</> : 'Create Customer'}
          </button>
        </form>
      )}

      {isLoading && <SkeletonTable rows={5} cols={3} />}
      {data?.data && (
        <div className="border rounded-xl overflow-hidden bg-white">
          <table className="w-full text-sm" role="table">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600" scope="col">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell" scope="col">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell" scope="col">Company</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.data.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-500">No customers found</td></tr>
              )}
              {data.data.map((c: any) => (
                <tr key={c._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{c.email}</td>
                  <td className="px-4 py-3 text-gray-600 hidden md:table-cell">{c.company || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
