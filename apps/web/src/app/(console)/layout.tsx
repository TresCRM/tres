'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useThemeMode } from '@/app/providers';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/apiClient';
import AuthGuard from '@/components/guards/AuthGuard';
import RoleGuard from '@/components/guards/RoleGuard';
import NotificationBell from '@/components/ui/NotificationBell';
import {
  LayoutDashboard, Ticket, Users, UserCog, CreditCard, BarChart3,
  Palette, Mail, Key, Webhook, MessageSquareCode, ShieldCheck, Activity,
  UserCircle, Menu, X, Moon, Sun, LogOut, ChevronDown,
} from 'lucide-react';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tickets', label: 'Tickets', icon: Ticket },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/staff', label: 'Staff', icon: UserCog },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
];

const settingsNav = [
  { href: '/settings/branding', label: 'Branding', icon: Palette },
  { href: '/settings/email', label: 'Email', icon: Mail },
  { href: '/settings/api-key', label: 'API Keys', icon: Key },
  { href: '/settings/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/settings/widget', label: 'Widget', icon: MessageSquareCode },
  { href: '/settings/status', label: 'Service Status', icon: Activity },
  { href: '/settings/security', label: 'Security', icon: ShieldCheck },
];

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useThemeMode();
  const { user } = useAuthStore();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/');

  const linkClass = (href: string) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
      isActive(href)
        ? 'bg-[var(--brand-primary,#4F46E5)] text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const sidebar = (
    <div className="flex flex-col h-full" aria-label="Main navigation wrapper">
      {/* Sticky header with logo — height matches main top bar (h-14) */}
      <div className="shrink-0 h-14 px-3 flex items-center border-b bg-white">
        <Link href="/dashboard" className="flex items-center px-3">
          <Image src="/logo-sm.png" alt="TRES CRM" width={32} height={32} />
        </Link>
      </div>

      {/* Scrollable nav region */}
      <nav
        className="flex-1 overflow-y-auto overscroll-contain p-3 space-y-0.5 sidebar-scroll"
        aria-label="Main navigation"
      >
        {nav.map(i => (
          <Link key={i.href} href={i.href} className={linkClass(i.href)} onClick={() => setSidebarOpen(false)}>
            <i.icon size={18} strokeWidth={isActive(i.href) ? 2.5 : 2} />
            {i.label}
          </Link>
        ))}
        <div className="mt-5 mb-1 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Settings</div>
        {/* Profile + security accessible to all authenticated users */}
        <Link href="/settings/profile" className={linkClass('/settings/profile')} onClick={() => setSidebarOpen(false)}>
          <UserCircle size={18} strokeWidth={isActive('/settings/profile') ? 2.5 : 2} />
          Profile
        </Link>
        <Link href="/settings/security" className={linkClass('/settings/security')} onClick={() => setSidebarOpen(false)}>
          <ShieldCheck size={18} strokeWidth={isActive('/settings/security') ? 2.5 : 2} />
          Security
        </Link>
        <RoleGuard roles={['ADMIN', 'OWNER']} fallback={null}>
          {settingsNav.filter(i => i.href !== '/settings/security').map(i => (
            <Link key={i.href} href={i.href} className={linkClass(i.href)} onClick={() => setSidebarOpen(false)}>
              <i.icon size={18} strokeWidth={isActive(i.href) ? 2.5 : 2} />
              {i.label}
            </Link>
          ))}
        </RoleGuard>
      </nav>
    </div>
  );

  return (
    <AuthGuard>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-white px-4 py-2 rounded shadow">
        Skip to content
      </a>
      <div className="min-h-screen flex">
        {/* Desktop sidebar */}
        <aside
          className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-white md:fixed md:inset-y-0 md:z-20 md:h-screen"
          aria-label="Sidebar"
        >
          {sidebar}
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <div className="fixed inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
            <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl z-50 flex flex-col">
              <div className="shrink-0 flex justify-end p-2 border-b">
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-gray-100"
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                {sidebar}
              </div>
            </aside>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 md:ml-60 flex flex-col">
          <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b flex items-center justify-between px-4 h-14">
            <button
              className="md:hidden p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-gray-100"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <div className="hidden md:block" />
            <div className="flex items-center gap-2">
              {user && <span className="text-sm text-gray-500 hidden sm:inline">{user.email}</span>}
              <NotificationBell />
              <button
                className="p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-gray-100 text-gray-500"
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <button
                onClick={async () => {
                  try { await authApi.logout(); } catch {}
                  useAuthStore.getState().clearAuth();
                  window.location.href = '/signin';
                }}
                className="p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </header>
          <main id="main-content" className="flex-1 p-4 md:p-6" role="main">
            {pathname?.startsWith('/settings') && !pathname?.startsWith('/settings/security') && !pathname?.startsWith('/settings/profile') && !pathname?.startsWith('/settings/change-password') ? (
              <RoleGuard roles={['ADMIN', 'OWNER']}>{children}</RoleGuard>
            ) : (
              children
            )}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
