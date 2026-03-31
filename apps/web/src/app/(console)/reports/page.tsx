'use client';

export default function ReportsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-xl p-6 bg-white shadow-sm">
          <h2 className="font-semibold mb-2">Ticket Reports</h2>
          <p className="text-sm text-gray-500">Open/closed over time, avg resolution time, avg first response time.</p>
          <p className="text-xs text-gray-400 mt-4 italic">Coming soon -- connect to survey analytics API</p>
        </div>
        <div className="border rounded-xl p-6 bg-white shadow-sm">
          <h2 className="font-semibold mb-2">Agent Performance</h2>
          <p className="text-sm text-gray-500">Tickets per agent per day, survey scores per agent.</p>
          <p className="text-xs text-gray-400 mt-4 italic">Coming soon</p>
        </div>
        <div className="border rounded-xl p-6 bg-white shadow-sm">
          <h2 className="font-semibold mb-2">Customer Reports</h2>
          <p className="text-sm text-gray-500">Top customers by ticket volume.</p>
          <p className="text-xs text-gray-400 mt-4 italic">Coming soon</p>
        </div>
        <div className="border rounded-xl p-6 bg-white shadow-sm">
          <h2 className="font-semibold mb-2">Survey Reports</h2>
          <p className="text-sm text-gray-500">Aggregate NPS, ratings, response rates.</p>
          <p className="text-xs text-gray-400 mt-4 italic">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
