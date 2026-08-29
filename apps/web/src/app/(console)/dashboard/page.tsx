'use client';

import Link from 'next/link';
import { useTickets, useSubscription, useCurrentUser } from '@/hooks/useApi';
import { useAuthStore } from '@/stores/authStore';
import { Ticket, TicketCheck, Hash, Shield, CreditCard, AlertTriangle, ArrowRight, Clock, CheckCircle } from 'lucide-react';

function SubscriptionBanner() {
  const { data: sub, isLoading } = useSubscription();

  if (isLoading) {
    return <div className="h-16 bg-gray-50 rounded-xl border animate-pulse mb-6" />;
  }

  const subscription = sub?.data;

  // No subscription at all
  if (!subscription) {
    return (
      <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <CreditCard size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-900">No active subscription</p>
              <p className="text-xs text-amber-700">Choose a plan to unlock all features and remove ticket limits.</p>
            </div>
          </div>
          <Link
            href="/billing"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 min-h-[44px] shrink-0"
          >
            View Plans <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  const now = new Date();
  const periodEnd = new Date(subscription.currentPeriodEnd);
  const daysLeft = Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / 86_400_000));
  const status = subscription.status as string;
  const planCode = subscription.planCode as string;

  // Status-based banner config
  let bgClass = '';
  let borderClass = '';
  let iconColor = '';
  let Icon = CheckCircle;
  let statusLabel = '';
  let statusBadgeClass = '';
  let message = '';
  let showUpgrade = false;

  if (status === 'ACTIVE') {
    bgClass = 'bg-green-50';
    borderClass = 'border-green-200';
    iconColor = 'text-green-600';
    Icon = CheckCircle;
    statusLabel = 'Active';
    statusBadgeClass = 'bg-green-100 text-green-700';
    message = daysLeft <= 7
      ? `Renews in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
      : `${daysLeft} days remaining`;
    showUpgrade = planCode === 'FREE' || planCode === 'IND-1';
  } else if (status === 'GRACE') {
    bgClass = 'bg-yellow-50';
    borderClass = 'border-yellow-300';
    iconColor = 'text-yellow-600';
    Icon = Clock;
    statusLabel = 'Grace Period';
    statusBadgeClass = 'bg-yellow-100 text-yellow-700';
    const graceEnd = subscription.graceUntil ? new Date(subscription.graceUntil) : periodEnd;
    const graceDays = Math.max(0, Math.ceil((graceEnd.getTime() - now.getTime()) / 86_400_000));
    message = `Payment overdue. ${graceDays} day${graceDays !== 1 ? 's' : ''} left before suspension.`;
  } else if (status === 'PAST_DUE') {
    bgClass = 'bg-orange-50';
    borderClass = 'border-orange-300';
    iconColor = 'text-orange-600';
    Icon = AlertTriangle;
    statusLabel = 'Past Due';
    statusBadgeClass = 'bg-orange-100 text-orange-700';
    message = 'Payment failed. Please update your billing details to avoid service interruption.';
  } else if (status === 'EXPIRED') {
    bgClass = 'bg-red-50';
    borderClass = 'border-red-300';
    iconColor = 'text-red-600';
    Icon = AlertTriangle;
    statusLabel = 'Expired';
    statusBadgeClass = 'bg-red-100 text-red-700';
    message = 'Your subscription has expired. Resubscribe to restore full access.';
  } else if (status === 'CANCELED') {
    bgClass = 'bg-gray-50';
    borderClass = 'border-gray-300';
    iconColor = 'text-gray-500';
    Icon = Clock;
    statusLabel = 'Canceled';
    statusBadgeClass = 'bg-gray-100 text-gray-600';
    message = daysLeft > 0
      ? `Access until ${periodEnd.toLocaleDateString()}. ${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining.`
      : 'Your subscription has ended. Resubscribe to continue.';
  }

  return (
    <div className={`rounded-xl border ${borderClass} ${bgClass} p-4 mb-6`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className={`h-10 w-10 rounded-full ${bgClass} flex items-center justify-center shrink-0`}>
            <Icon size={20} className={iconColor} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{planCode}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadgeClass}`}>{statusLabel}</span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">{message}</p>
          </div>
        </div>
        <Link
          href="/billing"
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] shrink-0 ${
            status === 'ACTIVE' && !showUpgrade
              ? 'border border-gray-300 text-gray-700 hover:bg-white'
              : 'bg-[var(--brand-primary,#4F46E5)] text-white hover:opacity-90'
          }`}
        >
          {status === 'ACTIVE' && !showUpgrade ? 'Manage' : status === 'ACTIVE' ? 'Upgrade' : 'View Plans'}
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const { data: me } = useCurrentUser();
  const { data: openData } = useTickets({ status: 'OPEN' });
  const { data: closedData } = useTickets({ status: 'CLOSED' });

  const openCount = openData?.data?.length ?? 0;
  const closedCount = closedData?.data?.length ?? 0;
  const greeting = me?.firstName ? `Welcome back, ${me.firstName}` : 'Dashboard';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">{greeting}</h1>
      <p className="text-sm text-gray-500 mb-6">Here&apos;s an overview of your workspace.</p>

      {/* Subscription banner */}
      <SubscriptionBanner />

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
        <Link href="/settings/profile" className="px-4 py-2.5 border rounded-lg font-medium text-sm hover:bg-gray-50 min-h-[44px] inline-flex items-center">
          Edit Profile
        </Link>
      </div>
    </div>
  );
}
