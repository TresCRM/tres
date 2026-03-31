'use client';

import Link from 'next/link';
import { useTickets } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { Ticket, TicketCheck, Hash, Shield } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: openData } = useTickets({ status: 'ACTIVE' });
  const { data: closedData } = useTickets({ status: 'CLOSED' });

  const openCount = openData?.data?.length ?? 0;
  const closedCount = closedData?.data?.length ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="rounded-xl border p-5 shadow-sm bg-white">
          <Ticket size={20} className="text-green-500 mb-2" />
          <p className="text-sm text-gray-500">Open Tickets</p>
          <p className="text-3xl font-bold mt-1">{openCount}</p>
        </div>
        <div className="rounded-xl border p-5 shadow-sm bg-white">
          <TicketCheck size={20} className="text-gray-400 mb-2" />
          <p className="text-sm text-gray-500">Closed Tickets</p>
          <p className="text-3xl font-bold mt-1">{closedCount}</p>
        </div>
        <div className="rounded-xl border p-5 shadow-sm bg-white">
          <Hash size={20} className="text-blue-500 mb-2" />
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-3xl font-bold mt-1">{openCount + closedCount}</p>
        </div>
        <div className="rounded-xl border p-5 shadow-sm bg-white">
          <Shield size={20} className="text-purple-500 mb-2" />
          <p className="text-sm text-gray-500">Your Role</p>
          <p className="text-lg font-semibold mt-1">{user?.roles?.join(', ') || '—'}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3">
        <Link href="/tickets" className="px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm hover:opacity-90 min-h-[44px] inline-flex items-center">
          View Tickets
        </Link>
        <Link href="/customers" className="px-4 py-2.5 border rounded-lg font-medium text-sm hover:bg-gray-50 min-h-[44px] inline-flex items-center">
          View Customers
        </Link>
      </div>
    </div>
  );
}
