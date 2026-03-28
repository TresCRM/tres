export default function PublicLayout({children}:{children:React.ReactNode}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <div className="font-bold">TRES CRM</div>
          <nav className="hidden md:flex gap-6 text-sm">
            <a href="/pricing">Pricing</a>
            <a href="/docs">Docs</a>
            <a href="/contact">Contact</a>
          </nav>
          <div className="flex gap-2">
            <a className="px-3 py-1.5 rounded border" href="/signin">Sign in</a>
            <a className="px-3 py-1.5 rounded bg-[var(--brand-primary)] text-white" href="/signup">Get started</a>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t py-8 text-center text-sm text-[var(--brand-muted)]">
        © {new Date().getFullYear()} TRES CRM
      </footer>
    </div>
  );
}
