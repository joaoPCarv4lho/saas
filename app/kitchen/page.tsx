'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface KitchenOrder { id: string; locationLabel: string; status: string; }

export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const router = useRouter();

  async function refresh() {
    const res = await fetch('/api/orders');
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const data = await res.json();
    setOrders((data.orders ?? []).filter((o: KitchenOrder) => ['open', 'preparing', 'ready'].includes(o.status)));
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  async function markReady(id: string) {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready' }),
    });
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    refresh();
  }

  return (
    <main>
      <h1>Cozinha</h1>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            {o.locationLabel} — {o.status}
            <button onClick={() => markReady(o.id)}>Marcar pronto</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
