'use client';

import { useState, useEffect } from 'react';
import { serviceStatusApi } from '@/lib/apiClient';
import { Loader2, Plus, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'OPERATIONAL', label: 'Operational', color: 'text-green-600', bg: 'bg-green-50' },
  { value: 'DEGRADED', label: 'Degraded', color: 'text-yellow-600', bg: 'bg-yellow-50' },
  { value: 'PARTIAL_OUTAGE', label: 'Partial Outage', color: 'text-orange-600', bg: 'bg-orange-50' },
  { value: 'MAJOR_OUTAGE', label: 'Major Outage', color: 'text-red-600', bg: 'bg-red-50' },
  { value: 'MAINTENANCE', label: 'Maintenance', color: 'text-blue-600', bg: 'bg-blue-50' },
];

export default function StatusManagementPage() {
  const [status, setStatus] = useState('OPERATIONAL');
  const [title, setTitle] = useState('All Systems Operational');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [incidentTitle, setIncidentTitle] = useState('');
  const [incidentMessage, setIncidentMessage] = useState('');
  const [incidents, setIncidents] = useState<any[]>([]);

  useEffect(() => {
    serviceStatusApi.get()
      .then(res => {
        const d = res.data.data;
        if (d) {
          setStatus(d.status || 'OPERATIONAL');
          setTitle(d.title || 'All Systems Operational');
          setMessage(d.message || '');
          setIncidents(d.incidents || []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await serviceStatusApi.update({ status, title, message });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  const handleCreateIncident = async () => {
    if (!incidentTitle.trim() || !incidentMessage.trim()) return;
    try {
      const res = await serviceStatusApi.createIncident({
        title: incidentTitle.trim(),
        message: incidentMessage.trim(),
      });
      setIncidents(prev => [...prev, res.data.data.incident]);
      setIncidentTitle('');
      setIncidentMessage('');
    } catch {}
  };

  if (loading) return <div className="p-8 text-center text-gray-500"><Loader2 className="animate-spin mx-auto" /></div>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Service Status</h1>

      {/* Overall Status */}
      <div className="border rounded-xl bg-white p-6 mb-6">
        <h2 className="font-medium mb-4">Overall Status</h2>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setStatus(opt.value); setTitle(opt.label); }}
              className={`px-3 py-2.5 rounded-lg text-sm font-medium border min-h-[44px] transition-colors ${
                status === opt.value ? opt.bg + ' border-current ' + opt.color : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <div>
            <label htmlFor="title" className="block text-sm font-medium mb-1">Title</label>
            <input id="title" value={title} onChange={e => setTitle(e.target.value)} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="message" className="block text-sm font-medium mb-1">Message (optional)</label>
            <textarea id="message" value={message} onChange={e => setMessage(e.target.value)} rows={2} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={saving} className="px-4 py-2.5 bg-[var(--brand-primary,#4F46E5)] text-white rounded-lg text-sm font-medium min-h-[44px]">
              {saving ? 'Saving...' : 'Update Status'}
            </button>
            {saved && <span className="text-green-600 text-sm flex items-center gap-1"><CheckCircle size={14} /> Saved</span>}
          </div>
        </div>
      </div>

      {/* Create Incident */}
      <div className="border rounded-xl bg-white p-6 mb-6">
        <h2 className="font-medium mb-4">Report Incident</h2>
        <div className="space-y-3">
          <input
            value={incidentTitle}
            onChange={e => setIncidentTitle(e.target.value)}
            placeholder="Incident title"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <textarea
            value={incidentMessage}
            onChange={e => setIncidentMessage(e.target.value)}
            placeholder="Describe the incident..."
            rows={2}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={handleCreateIncident}
            disabled={!incidentTitle.trim() || !incidentMessage.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium min-h-[44px]"
          >
            <Plus size={16} /> Create Incident
          </button>
        </div>
      </div>

      {/* Incidents List */}
      {incidents.length > 0 && (
        <div className="border rounded-xl bg-white p-6">
          <h2 className="font-medium mb-4">Incidents</h2>
          <div className="space-y-4">
            {incidents.map((inc: any, i: number) => (
              <div key={i} className={`border rounded-lg p-4 ${inc.status === 'RESOLVED' ? 'bg-gray-50' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-sm">{inc.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    inc.status === 'RESOLVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  }`}>{inc.status}</span>
                </div>
                {inc.updates?.map((u: any, j: number) => (
                  <p key={j} className="text-xs text-gray-600 mt-1">{u.message}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
