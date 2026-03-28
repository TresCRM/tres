export default async function Dashboard() {
  // You can fetch server-side stats here using fetch() with revalidate.
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <div className="rounded-2xl border p-4 shadow-sm">Open Tickets: 0</div>
      <div className="rounded-2xl border p-4 shadow-sm">Avg First Response: –</div>
      <div className="rounded-2xl border p-4 shadow-sm">SLA Breaches: –</div>
    </div>
  );
}
