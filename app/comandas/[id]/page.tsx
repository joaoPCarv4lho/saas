'use client';
import { useEffect, useState, use } from 'react';

interface MenuCategory { id: string; name: string; items: { id: string; name: string; priceCents: number }[]; }
interface OrderItem { id: string; menuItemId: string; quantity: number; status: string; }
interface OrderDetail { id: string; status: string; items: OrderItem[]; }

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [menu, setMenu] = useState<MenuCategory[]>([]);

  async function refresh() {
    const res = await fetch(`/api/orders/${id}`);
    setOrder((await res.json()).order);
  }

  useEffect(() => {
    refresh();
    fetch('/api/menu').then((r) => r.json()).then((d) => setMenu(d.categories ?? []));
  }, [id]);

  async function addItem(menuItemId: string) {
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addItem: { menuItemId, quantity: 1, note: '' } }),
    });
    refresh();
  }

  if (!order) return <p>Carregando...</p>;

  return (
    <main>
      <h1>Comanda — {order.status}</h1>
      <ul>
        {order.items.map((i) => (
          <li key={i.id}>{i.quantity}x {i.menuItemId} — {i.status}</li>
        ))}
      </ul>
      <h2>Cardapio</h2>
      {menu.map((c) => (
        <div key={c.id}>
          <h3>{c.name}</h3>
          {c.items.map((it) => (
            <button key={it.id} onClick={() => addItem(it.id)}>{it.name} — R$ {(it.priceCents / 100).toFixed(2)}</button>
          ))}
        </div>
      ))}
    </main>
  );
}
