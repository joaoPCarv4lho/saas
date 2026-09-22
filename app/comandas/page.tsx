'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface OrderSummary { id: string; locationLabel: string; status: string; }

function getDeviceId(): string {
  let id = localStorage.getItem('deviceId');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('deviceId', id);
  }
  return id;
}

export default function ComandasPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [locationLabel, setLocationLabel] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch('/api/orders').then((r) => {
      if (r.status === 401) {
        router.push('/login');
        return null;
      }
      return r.json();
    }).then((d) => setOrders(d?.orders ?? []));
  }, [router]);

  async function createOrder() {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId: getDeviceId(), locationType: 'table', locationLabel }),
    });
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    const { order } = await res.json();
    // A fresh order has no items yet; seed the SW's api cache with that fact
    // so the detail page (whose own GET may not finish before a disconnect)
    // still has something to render offline instead of spinning forever.
    if ('caches' in window) {
      const seeded = new Response(JSON.stringify({ order: { ...order, items: [] } }), {
        headers: { 'Content-Type': 'application/json' },
      });
      await caches.open('apis').then((c) => c.put(`/api/orders/${order.id}`, seeded));
    }
    router.push(`/comandas/${order.id}`);
  }

  return (
    <main>
      <h1>Comandas</h1>
      <input placeholder="Mesa" value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
      <button onClick={createOrder}>Nova comanda</button>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            <a href={`/comandas/${o.id}`}>{o.locationLabel} — {o.status}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
