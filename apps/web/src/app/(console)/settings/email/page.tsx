'use client';

import { useState } from 'react';
import { Mail, Send, CheckCircle, Loader2 } from 'lucide-react';
import api from '@/lib/api';

export default function EmailSettingsPage() {
  const [testEmail, setTestEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestEmail = async () => {
    if (!testEmail.trim()) return;
    setSending(true);
    setResult(null);
    try {
      await api.post('/settings/test-email', { to: testEmail.trim() });
      setResult({ success: true, message: 'Test email sent successfully. Check your inbox.' });
    } catch (err: any) {
      setResult({ success: false, message: err.response?.data?.message || 'Failed to send test email.' });
    }
    setSending(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Email Settings</h1>

      {/* Current Configuration */}
      <div className="border rounded-xl bg-white p-6 mb-6">
        <h2 className="font-medium mb-4">Email Configuration</h2>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">Provider</span>
            <span className="font-mono">{process.env.NEXT_PUBLIC_SMTP_PROVIDER || 'default'}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-gray-500">From Address</span>
            <span className="font-mono">Configured in branding settings</span>
          </div>
          <p className="text-xs text-gray-400 mt-3">
            SMTP configuration is managed via environment variables. Contact your administrator to change the email provider.
            Custom &quot;From&quot; addresses can be set in Branding settings.
          </p>
        </div>
      </div>

      {/* Test Email */}
      <div className="border rounded-xl bg-white p-6">
        <h2 className="font-medium mb-4">Test Email Delivery</h2>
        <p className="text-sm text-gray-500 mb-4">Send a test email to verify your SMTP configuration is working correctly.</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="recipient@example.com"
            className="flex-1 border rounded-md px-3 py-2.5 text-sm"
          />
          <button
            onClick={handleTestEmail}
            disabled={sending || !testEmail.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px]"
          >
            {sending ? <><Loader2 size={16} className="animate-spin" /> Sending...</> : <><Send size={16} /> Send Test</>}
          </button>
        </div>
        {result && (
          <div className={`mt-3 p-3 rounded-md text-sm ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
            {result.success ? <CheckCircle size={14} className="inline mr-1" /> : <Mail size={14} className="inline mr-1" />}
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
