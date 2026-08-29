'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Ticket, User, Home, LogIn, Activity, LogOut } from 'lucide-react';
import api from '@/lib/api';
import { usePortalAuth } from './_lib/usePortalAuth';

interface TenantBranding {
  name: string;
  primaryColor?: string;
  surfaceColor?: string;
  logoUrl?: string;
  customGreeting?: string;
}

function PortalLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { tenantSlug, qs, isAuthed, signOut } = usePortalAuth();

  const [branding, setBranding] = useState<TenantBranding | null>(null);

  // Load tenant branding from public status endpoint (which returns tenant info)
  useEffect(() => {
    if (!tenantSlug) return;
    api.get(`/api/v1/service-status/public/${tenantSlug}`)
      .then(res => {
        if (res.data.data?.tenant) {
          setBranding(res.data.data.tenant);
        }
      })
      .catch(() => {}); // branding is optional — fallback to defaults
  }, [tenantSlug]);

  // Apply tenant branding as CSS variables
  useEffect(() => {
    if (!branding) return;
    const root = document.documentElement;
    if (branding.primaryColor) root.style.setProperty('--brand-primary', branding.primaryColor);
    if (branding.surfaceColor) root.style.setProperty('--brand-bg', branding.surfaceColor);
    return () => {
      root.style.removeProperty('--brand-primary');
      root.style.removeProperty('--brand-bg');
    };
  }, [branding]);

  const isLoginPage = pathname === '/portal/login';
  // Login page has its own layout
  if (isLoginPage) return <>{children}</>;

  // Authenticated menu items — only rendered when a portal token is present.
  const authedNavItems = [
    { href: '/portal' + qs, label: 'Dashboard', icon: Home },
    { href: '/portal/tickets' + qs, label: 'My Tickets', icon: Ticket },
    { href: '/portal/status' + qs, label: 'Status', icon: Activity },
    { href: '/portal/profile' + qs, label: 'Profile', icon: User },
  ];

  const displayName = branding?.name || 'Support Portal';

  return (
    <div className="min-h-screen bg-[var(--brand-bg,#f9fafb)]">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href={isAuthed ? '/portal' + qs : '/portal/login'} className="flex items-center gap-2 font-bold text-lg text-[var(--brand-primary,#4F46E5)]">
            {branding?.logoUrl && (
              <img src={branding.logoUrl} alt="" className="h-7 w-7 object-contain rounded" />
            )}
            {displayName}
          </Link>
          <nav className="flex items-center gap-1" aria-label="Portal navigation">
            {isAuthed ? (
              <>
                {authedNavItems.map(({ href, label, icon: Icon }) => {
                  const isActive = pathname === href.split('?')[0];
                  return (
                    <Link
                      key={label}
                      href={href}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
                        isActive
                          ? 'bg-[var(--brand-primary,#4F46E5)] text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="hidden sm:inline">{label}</span>
                    </Link>
                  );
                })}
                <button
                  type="button"
                  onClick={signOut}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 min-h-[44px]"
                  aria-label="Sign out"
                >
                  <LogOut size={16} />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </>
            ) : (
              <Link
                href="/portal/login"
                className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 min-h-[44px]"
              >
                <LogIn size={16} />
                <span className="hidden sm:inline">Sign In</span>
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>
    </div>
  );
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--brand-bg,#f9fafb)]" />}>
      <PortalLayoutInner>{children}</PortalLayoutInner>
    </Suspense>
  );
}
