'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, DollarSign, BookOpen, Mail, Users, Briefcase } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Home', icon: Home, exact: true },
  { href: '/pricing', label: 'Pricing', icon: DollarSign },
  { href: '/docs', label: 'API Docs', icon: BookOpen },
  { href: '/contact', label: 'Contact', icon: Mail },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname?.startsWith(href + '/');

  const navLinkClass = (href: string, exact?: boolean) =>
    `flex items-center gap-1.5 transition-colors relative py-1 ${
      isActive(href, exact)
        ? 'text-[var(--brand-primary,#4F46E5)] font-semibold'
        : 'text-gray-600 hover:text-gray-900'
    }`;

  const footerLinkClass = (href: string) =>
    `transition-colors ${
      isActive(href)
        ? 'text-[var(--brand-primary,#4F46E5)] font-medium'
        : 'hover:text-gray-700'
    }`;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1">
            <Image src="/logo-sm.png" alt="TRES CRM" width={50} height={28} priority />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium" aria-label="Main navigation">
            {navItems.map(item => (
              <Link key={item.href} href={item.href} className={navLinkClass(item.href, item.exact)}>
                <item.icon size={15} />
                {item.label}
                {isActive(item.href, item.exact) && (
                  <span className="absolute -bottom-3.5 left-0 right-0 h-0.5 bg-[var(--brand-primary,#4F46E5)] rounded-full" />
                )}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/signin"
              className={`inline-flex px-4 py-2 text-sm font-medium rounded-lg border min-h-[40px] items-center transition-colors ${
                isActive('/signin')
                  ? 'border-[var(--brand-primary,#4F46E5)] text-[var(--brand-primary,#4F46E5)] bg-indigo-50'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className={`px-4 py-2 text-sm font-medium rounded-lg min-h-[40px] inline-flex items-center transition-all ${
                isActive('/signup')
                  ? 'bg-[var(--brand-primary,#4F46E5)] text-white ring-2 ring-[var(--brand-primary,#4F46E5)] ring-offset-2'
                  : 'bg-[var(--brand-primary,#4F46E5)] text-white hover:opacity-90'
              }`}
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <h3 className="font-semibold text-sm mb-3">Product</h3>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/" className={footerLinkClass('/')}>Home</Link></li>
                <li><Link href="/pricing" className={footerLinkClass('/pricing')}>Pricing</Link></li>
                <li><Link href="/docs" className={footerLinkClass('/docs')}>API Docs</Link></li>
                <li><Link href="/signup" className={footerLinkClass('/signup')}>Get Started</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-3">Features</h3>
              <ul className="space-y-2 text-sm text-gray-500">
                <li>Ticketing</li><li>Surveys &amp; NPS</li><li>API &amp; Webhooks</li><li>Embeddable Widget</li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-3">Company</h3>
              <ul className="space-y-2 text-sm text-gray-500">
                <li><Link href="/about" className={footerLinkClass('/about')}>About</Link></li>
                <li><Link href="/careers" className={footerLinkClass('/careers')}>Careers</Link></li>
                <li><Link href="/contact" className={footerLinkClass('/contact')}>Contact</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-3">Legal</h3>
              <ul className="space-y-2 text-sm text-gray-500"><li>Privacy Policy</li><li>Terms of Service</li></ul>
            </div>
          </div>
          <div className="mt-8 pt-8 border-t text-center text-sm text-gray-400">&copy; {new Date().getFullYear()} TRES CRM. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
