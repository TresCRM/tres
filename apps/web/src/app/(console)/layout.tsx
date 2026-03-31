'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useThemeMode } from '@/app/providers';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/apiClient';
import AuthGuard from '@/components/guards/AuthGuard';
import RoleGuard from '@/components/guards/RoleGuard';
import {
  LayoutDashboard, Ticket, Users, UserCog, CreditCard, BarChart3,
  Palette, Mail, Key, Webhook, MessageSquareCode,
  Menu, X, Moon, Sun, LogOut, ChevronDown,
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
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Main navigation">
      <Link href="/dashboard" className="flex items-center gap-2.5 px-3 mb-5">
        <div className="w-8 h-8 bg-[var(--brand-primary,#4F46E5)] rounded-lg flex items-center justify-center text-white font-bold text-sm">T</div>
        <span className="font-bold text-lg">TRES CRM</span>
      </Link>
      {nav.map(i => (
        <Link key={i.href} href={i.href} className={linkClass(i.href)} onClick={() => setSidebarOpen(false)}>
          <i.icon size={18} strokeWidth={isActive(i.href) ? 2.5 : 2} />
          {i.label}
        </Link>
      ))}
      <RoleGuard roles={['ADMIN', 'OWNER']} fallback={null}>
        <div className="mt-5 mb-1 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Settings</div>
        {settingsNav.map(i => (
          <Link key={i.href} href={i.href} className={linkClass(i.href)} onClick={() => setSidebarOpen(false)}>
            <i.icon size={18} strokeWidth={isActive(i.href) ? 2.5 : 2} />
            {i.label}
          </Link>
        ))}
      </RoleGuard>
    </nav>
  );

  return (
    <AuthGuard>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-white px-4 py-2 rounded shadow">
        Skip to content
      </a>
      <div className="min-h-screen flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-white md:fixed md:inset-y-0 md:z-20" aria-label="Sidebar">
          {sidebar}
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <div className="fixed inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
            <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-xl z-50 overflow-y-auto">
              <div className="flex justify-end p-2">
                <button onClick={() => setSidebarOpen(false)} className="p-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-gray-100" aria-label="Close menu">
                  <X size={20} />
                </button>
              </div>
              {sidebar}
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
            {pathname?.startsWith('/settings') ? (
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
