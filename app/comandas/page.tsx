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
