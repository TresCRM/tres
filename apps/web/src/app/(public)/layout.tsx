import Link from 'next/link';
import { BookOpen, Mail, DollarSign } from 'lucide-react';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[var(--brand-primary,#4F46E5)] rounded-lg flex items-center justify-center text-white font-bold text-sm">T</div>
            <span className="font-bold text-lg tracking-tight">TRES CRM</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-gray-600" aria-label="Main navigation">
            <Link href="/pricing" className="flex items-center gap-1.5 hover:text-gray-900 transition-colors">
              <DollarSign size={15} />Pricing
            </Link>
            <Link href="/docs" className="flex items-center gap-1.5 hover:text-gray-900 transition-colors">
              <BookOpen size={15} />API Docs
            </Link>
            <Link href="/contact" className="flex items-center gap-1.5 hover:text-gray-900 transition-colors">
              <Mail size={15} />Contact
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/signin" className="hidden sm:inline-flex px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors min-h-[40px] items-center">
              Sign in
            </Link>
            <Link href="/signup" className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--brand-primary,#4F46E5)] text-white hover:opacity-90 transition-opacity min-h-[40px] inline-flex items-center">
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
                <li><Link href="/pricing" className="hover:text-gray-700">Pricing</Link></li>
                <li><Link href="/docs" className="hover:text-gray-700">API Docs</Link></li>
                <li><Link href="/signup" className="hover:text-gray-700">Get Started</Link></li>
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
                <li><Link href="/about" className="hover:text-gray-700">About</Link></li>
                <li><Link href="/careers" className="hover:text-gray-700">Careers</Link></li>
                <li><Link href="/contact" className="hover:text-gray-700">Contact</Link></li>
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
