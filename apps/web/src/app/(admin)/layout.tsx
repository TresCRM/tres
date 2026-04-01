'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useThemeMode } from '@/app/providers';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/apiClient';
import AuthGuard from '@/components/guards/AuthGuard';
import {
  LayoutDashboard, Building2, Users, CreditCard, Ticket, BarChart3,
  FileText, Shield, Settings, Megaphone, Menu, X, Moon, Sun, LogOut,
  ArrowLeft,
} from 'lucide-react';

const nav = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/tenants', label: 'Tenants', icon: Building2 },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/admin/tickets', label: 'Tickets', icon: Ticket },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/content', label: 'Content', icon: FileText },
  { href: '/admin/audit', label: 'Audit Log', icon: Shield },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
  { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useThemeMode();
  const { user } = useAuthStore();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname?.startsWith(href + '/');

  const linkClass = (href: string, exact?: boolean) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
      isActive(href, exact)
        ? 'bg-red-600 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const sidebar = (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="Admin navigation">
      <Link href="/admin" className="flex items-center gap-2 px-3 mb-2">
        <Image src="/logo-sm.png" alt="TRES CRM" width={73} height={40} />
      </Link>
      <div className="px-3 mb-3">
        <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-1 rounded">
          <Shield size={12} /> Admin Panel
        </span>
      </div>
      {nav.map(i => (
        <Link key={i.href} href={i.href} className={linkClass(i.href, i.exact)} onClick={() => setSidebarOpen(false)}>
          <i.icon size={18} strokeWidth={isActive(i.href, i.exact) ? 2.5 : 2} />
          {i.label}
        </Link>
      ))}
      <div className="mt-4 pt-4 border-t">
        <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors min-h-[44px]">
          <ArrowLeft size={18} />
          Back to Console
        </Link>
      </div>
    </nav>
  );

  return (
    <AuthGuard>
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 bg-white px-4 py-2 rounded shadow">
        Skip to content
      </a>
      <div className="min-h-screen flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:bg-white md:fixed md:inset-y-0 md:z-20" aria-label="Admin sidebar">
          {sidebar}
        </aside>

        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
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
            <div className="hidden md:flex items-center gap-2">
              <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">ADMIN</span>
            </div>
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
          <main id="admin-content" className="flex-1 p-4 md:p-6" role="main">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
