'use client';
import { Button } from "@/components/ui/Button";
export default function Landing() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16">
      <div className="grid md:grid-cols-2 gap-8 items-center">
        <div>
          <h1 className="text-4xl font-bold leading-tight">Simple, brandable support CRM for teams of any size.</h1>
          <p className="mt-3 text-gray-600">Tickets, email, surveys, analytics — white-labelled to your brand.</p>
          <div className="mt-6 flex gap-3">
            <a className="px-5 py-3 rounded-xl bg-[var(--brand-primary)] text-white" href="/signup">Start free</a>
            <a className="px-5 py-3 rounded-xl border" href="/pricing">View pricing</a>
            <Button onClick={()=>{/* open modal */}}>Explore</Button>
          </div>
        </div>
        <div className="rounded-2xl border p-4 shadow" aria-hidden />
      </div>
    </section>
  );
}
