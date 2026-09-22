'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface KitchenItem { id: string; menuItemId: string; quantity: number; }
interface KitchenOrder { id: string; locationLabel: string; status: string; items: KitchenItem[]; }
interface MenuCategory { items: { id: string; name: string }[]; }

export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [menuNames, setMenuNames] = useState<Record<string, string>>({});
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
    fetch('/api/menu').then((r) => r.json()).then((d) => {
      const names: Record<string, string> = {};
      for (const c of (d.categories ?? []) as MenuCategory[]) {
        for (const item of c.items) names[item.id] = item.name;
      }
      setMenuNames(names);
    });
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
    <main className="kitchen-screen">
      <div className="screen-head" style={{ maxWidth: 1100, margin: '0 auto 18px' }}>
        <h1>Cozinha</h1>
        <span className="count mono">{orders.length} pedido{orders.length === 1 ? '' : 's'}</span>
      </div>

      {orders.length === 0 ? (
        <p className="empty-note-dark">Nenhum pedido em aberto.</p>
      ) : (
        <div className="kitchen-grid">
          {orders.map((o) => (
            <div key={o.id} className="kds-ticket" data-status={o.status}>
              <div className="kds-ticket-head">
                <span className="table">MESA {o.locationLabel}</span>
                <span className="chip" data-status={o.status}>{o.status}</span>
              </div>
              <ul className="kds-items">
                {o.items.length === 0
                  ? <li>—</li>
                  : o.items.map((i) => <li key={i.id}>{i.quantity}x {menuNames[i.menuItemId] ?? i.menuItemId}</li>)}
              </ul>
              {o.status !== 'ready' && (
                <button className="btn" onClick={() => markReady(o.id)}>Marcar pronto</button>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
