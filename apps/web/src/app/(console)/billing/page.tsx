'use client';

import { useSubscription, usePlans } from '@/hooks/useApi';

export default function BillingPage() {
  const { data: sub, isLoading: subLoading } = useSubscription();
  const { data: plans, isLoading: plansLoading } = usePlans();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      {/* Current plan */}
      <div className="border rounded-xl p-6 bg-white shadow-sm mb-8">
        <h2 className="text-lg font-semibold mb-3">Current Plan</h2>
        {subLoading && <p className="text-gray-500">Loading...</p>}
        {sub?.data && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-500">Plan</p>
              <p className="text-xl font-bold">{sub.data.planCode}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Status</p>
              <span className={`text-sm px-2 py-1 rounded-full font-medium ${
                sub.data.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                sub.data.status === 'GRACE' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>{sub.data.status}</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Period Ends</p>
              <p className="font-medium">{new Date(sub.data.currentPeriodEnd).toLocaleDateString()}</p>
            </div>
          </div>
        )}
        {!subLoading && !sub?.data && <p className="text-gray-500">No active subscription</p>}
      </div>

      {/* Plans table */}
      <h2 className="text-lg font-semibold mb-3">Available Plans</h2>
      {plansLoading && <p className="text-gray-500">Loading plans...</p>}
      {plans && (
        <div className="border rounded-xl overflow-x-auto bg-white">
          <table className="w-full text-sm" role="table">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium" scope="col">Plan</th>
                <th className="text-left px-4 py-3 font-medium" scope="col">Seats</th>
                <th className="text-left px-4 py-3 font-medium" scope="col">Price/mo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {plans.map((p: any) => (
                <tr key={p.code} className={`hover:bg-gray-50 ${sub?.data?.planCode === p.code ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3 font-medium">
                    {p.name}
                    {sub?.data?.planCode === p.code && <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full">Current</span>}
                  </td>
                  <td className="px-4 py-3">{p.seats}</td>
                  <td className="px-4 py-3">{p.isCustom ? 'Contact sales' : `$${(p.priceCentsMonthly / 100).toFixed(0)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
