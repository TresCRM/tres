'use client';

import Link from 'next/link';
import { Ticket, Plus, Clock, LogIn } from 'lucide-react';
import { usePortalAuth } from './_lib/usePortalAuth';

export default function PortalDashboard() {
  const { isAuthed, qs } = usePortalAuth();

  if (!isAuthed) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <LogIn size={22} className="text-gray-500" />
        </div>
        <h1 className="text-xl font-bold mb-2">Sign in to your support portal</h1>
        <p className="text-gray-500 mb-6">
          Enter your email and we&apos;ll send you a magic link to view and reply to your tickets.
        </p>
        <Link
          href="/portal/login"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px]"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Welcome to Support</h1>
      <p className="text-gray-500 mb-6">Track your tickets and get help.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Link
          href={'/portal/tickets' + qs}
          className="border rounded-xl p-5 bg-white hover:shadow-md transition-shadow flex items-start gap-3"
        >
          <Ticket size={24} className="text-[var(--brand-primary,#4F46E5)] mt-0.5" />
          <div>
            <h3 className="font-medium">My Tickets</h3>
            <p className="text-sm text-gray-500">View and track your support requests</p>
          </div>
        </Link>

        <Link
          href={'/portal/tickets/new' + qs}
          className="border rounded-xl p-5 bg-white hover:shadow-md transition-shadow flex items-start gap-3"
        >
          <Plus size={24} className="text-green-600 mt-0.5" />
          <div>
            <h3 className="font-medium">New Ticket</h3>
            <p className="text-sm text-gray-500">Submit a new support request</p>
          </div>
        </Link>

        <Link
          href={'/portal/profile' + qs}
          className="border rounded-xl p-5 bg-white hover:shadow-md transition-shadow flex items-start gap-3"
        >
          <Clock size={24} className="text-amber-500 mt-0.5" />
          <div>
            <h3 className="font-medium">Profile</h3>
            <p className="text-sm text-gray-500">Manage your contact details</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
