'use client';

import { useState } from 'react';
import { Mail, Phone, BookOpen, Clock } from 'lucide-react';

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="py-16 px-4">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-center mb-4">Get in touch</h1>
        <p className="text-center text-gray-600 mb-12">Have a question about TRES CRM? Want a demo or need help with your account? We're here to help.</p>

        <div className="grid md:grid-cols-2 gap-12">
          {/* Contact form */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Send us a message</h2>
            <form className="space-y-4" onSubmit={e => { e.preventDefault(); setSubmitted(true); }}>
              <div>
                <label htmlFor="contact-name" className="block text-sm font-medium mb-1">Name</label>
                <input id="contact-name" type="text" placeholder="Your name" className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)] focus:outline-none" required aria-required="true" />
              </div>
              <div>
                <label htmlFor="contact-email" className="block text-sm font-medium mb-1">Email</label>
                <input id="contact-email" type="email" placeholder="you@company.com" className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)] focus:outline-none" required aria-required="true" />
              </div>
              <div>
                <label htmlFor="contact-subject" className="block text-sm font-medium mb-1">Subject</label>
                <select id="contact-subject" className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)] focus:outline-none">
                  <option>General inquiry</option>
                  <option>Sales / Enterprise pricing</option>
                  <option>Technical support</option>
                  <option>Partnership</option>
                  <option>Bug report</option>
                </select>
              </div>
              <div>
                <label htmlFor="contact-message" className="block text-sm font-medium mb-1">Message</label>
                <textarea id="contact-message" rows={5} placeholder="Tell us how we can help..." className="w-full border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-[var(--brand-primary,#4F46E5)] focus:outline-none" required aria-required="true" />
              </div>
              <button type="submit" disabled={submitted} className="w-full px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg font-medium text-sm hover:opacity-90 min-h-[44px] disabled:opacity-50">
                {submitted ? 'Message sent!' : 'Send message'}
              </button>
              {submitted && <p className="text-green-600 text-sm text-center" role="alert">Message sent! We'll get back to you within 24 hours.</p>}
            </form>
          </div>

          {/* Contact info */}
          <div>
            <h2 className="text-lg font-semibold mb-4">Other ways to reach us</h2>
            <div className="space-y-6">
              <div className="border rounded-lg p-4">
                <Mail size={18} className="text-[var(--brand-primary,#4F46E5)] mb-2" />
                <h3 className="font-medium text-sm mb-1">Email</h3>
                <p className="text-sm text-gray-600">support@trescrm.com</p>
                <p className="text-xs text-gray-400 mt-1">We respond within 24 hours</p>
              </div>
              <div className="border rounded-lg p-4">
                <Mail size={18} className="text-[var(--brand-primary,#4F46E5)] mb-2" />
                <h3 className="font-medium text-sm mb-1">Sales</h3>
                <p className="text-sm text-gray-600">sales@trescrm.com</p>
                <p className="text-xs text-gray-400 mt-1">For enterprise plans and custom contracts</p>
              </div>
              <div className="border rounded-lg p-4">
                <BookOpen size={18} className="text-[var(--brand-primary,#4F46E5)] mb-2" />
                <h3 className="font-medium text-sm mb-1">API Documentation</h3>
                <p className="text-sm text-gray-600"><a href="/docs" className="text-[var(--brand-primary,#4F46E5)] hover:underline">View interactive API docs</a></p>
                <p className="text-xs text-gray-400 mt-1">OpenAPI 3.0 with Swagger UI</p>
              </div>
              <div className="border rounded-lg p-4">
                <Clock size={18} className="text-[var(--brand-primary,#4F46E5)] mb-2" />
                <h3 className="font-medium text-sm mb-1">Office Hours</h3>
                <p className="text-sm text-gray-600">Monday - Friday, 9am - 6pm WAT</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
