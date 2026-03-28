'use client';
import { useThemeMode } from '@/app/providers';
import Link from 'next/link';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/tickets', label: 'Tickets', icon: 'inbox' },
  { href: '/customers', label: 'Customers', icon: 'users' },
  { href: '/staff', label: 'Staff', icon: 'id' },
  { href: '/billing', label: 'Billing', icon: 'credit' },
  { href: '/settings/branding', label: 'Branding', icon: 'palette' },
];

export default function ConsoleLayout({children}:{children:React.ReactNode}) {
  const { theme, setTheme } = useThemeMode();
  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="border-r p-3">
        <div className="font-bold mb-4">TRES Admin</div>
        <nav className="flex flex-col gap-1">
          {nav.map(i => <Link key={i.href} className="px-3 py-2 rounded hover:bg-gray-100" href={i.href}>{i.label}</Link>)}
        </nav>
      </aside>
      <section>
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur border-b flex items-center justify-between px-4 h-12">
          <div />
          <button className="text-sm" onClick={()=>setTheme(theme==='light'?'dark':'light')}>Toggle {theme}</button>
        </header>
        <main className="p-4">{children}</main>
      </section>
    </div>
  );
}
