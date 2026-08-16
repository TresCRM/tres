'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ticketsApi, customersApi, usersApi, subscriptionsApi, settingsApi, surveysApi, authApi } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';

// ─── Auth ──────────────────────────────────────────

export function useCurrentUser() {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.me().then(r => r.data),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
}

export function useSessions() {
  return useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: () => authApi.sessions().then(r => r.data.data),
  });
}

// ─── Tickets ───────────────────────────────────────

export function useTickets(params?: { status?: string; priority?: string; q?: string }) {
  return useQuery({
    queryKey: ['tickets', params],
    queryFn: () => ticketsApi.list(params).then(r => r.data),
    staleTime: 30_000,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: ['tickets', id],
    queryFn: () => ticketsApi.get(id).then(r => r.data.data),
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof ticketsApi.create>[0]) => ticketsApi.create(data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useReplyTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) => ticketsApi.reply(id, body).then(r => r.data),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['tickets', vars.id] }),
  });
}

export function useCloseTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ticketsApi.close(id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

export function useReopenTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ticketsApi.reopen(id).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tickets'] }),
  });
}

// ─── Customers ─────────────────────────────────────

export function useCustomers(params?: { q?: string }) {
  return useQuery({
    queryKey: ['customers', params],
    queryFn: () => customersApi.list(params).then(r => r.data),
    staleTime: 60_000,
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: ['customers', id],
    queryFn: () => customersApi.get(id).then(r => r.data.data),
    enabled: !!id,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof customersApi.create>[0]) => customersApi.create(data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
}

// ─── Users ─────────────────────────────────────────

export function useUsers(params?: { status?: string }) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => usersApi.list(params).then(r => r.data),
    staleTime: 60_000,
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof usersApi.invite>[0]) => usersApi.invite(data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

// ─── Subscriptions ─────────────────────────────────

export function useSubscription() {
  return useQuery({
    queryKey: ['subscription', 'me'],
    queryFn: () => subscriptionsApi.me().then(r => r.data),
    staleTime: 5 * 60_000,
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ['plans'],
    queryFn: () => subscriptionsApi.plans().then(r => r.data.data),
    staleTime: 30 * 60_000,
  });
}

// ─── Settings ──────────────────────────────────────

export function useBranding() {
  return useQuery({
    queryKey: ['branding'],
    queryFn: () => settingsApi.getBranding().then(r => r.data.data),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateBranding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof settingsApi.updateBranding>[0]) => settingsApi.updateBranding(data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branding'] }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { firstName?: string; lastName?: string }) => authApi.updateProfile(data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: (data: { planCode: string; interval: string; email: string; callbackUrl: string }) =>
      subscriptionsApi.checkout(data).then(r => r.data),
  });
}

export function useActivateSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { planCode: string; prepayMonths?: number }) =>
      subscriptionsApi.activate(data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }),
  });
}

// ─── Surveys ───────────────────────────────────────

export function useSurveyAnalytics(id: string) {
  return useQuery({
    queryKey: ['surveys', id, 'analytics'],
    queryFn: () => surveysApi.analytics(id).then(r => r.data.data),
    enabled: !!id,
  });
}
