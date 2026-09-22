'use client';
import { useEffect, useState, use } from 'react';

interface MenuCategory { id: string; name: string; items: { id: string; name: string; priceCents: number }[]; }
interface OrderItem { id: string; menuItemId: string; quantity: number; status: string; }
interface OrderDetail { id: string; status: string; items: OrderItem[]; }

function menuItemName(menu: MenuCategory[], menuItemId: string): string {
  for (const c of menu) {
    const item = c.items.find((i) => i.id === menuItemId);
    if (item) return item.name;
  }
  return menuItemId;
}

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

  if (!order) return <main className="screen"><p className="empty-note">Carregando...</p></main>;

  return (
    <main className="screen">
      <div className="receipt-head">
        <h1>Comanda — {order.status}</h1>
        <span className="chip" data-status={order.status}>{order.status}</span>
      </div>

      {order.items.length === 0 ? (
        <p className="empty-note" style={{ padding: '18px 0' }}>Nenhum item ainda. Escolha no cardapio abaixo.</p>
      ) : (
        <ul className="receipt-lines">
          {order.items.map((i) => (
            <li key={i.id} className="receipt-line">
              <span className="qty">{i.quantity}x</span>
              <span className="name">{menuItemName(menu, i.menuItemId)}</span>
              <span className="leader" />
              <span className="chip mono" data-status={i.status}>{i.status}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="menu-section">
        <h2>Cardapio</h2>
        {menu.map((c) => (
          <div key={c.id} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginBottom: 6 }}>{c.name}</h3>
            <div className="menu-grid">
              {c.items.map((it) => (
                <button key={it.id} className="menu-item-btn" onClick={() => addItem(it.id)}>
                  <span>{it.name}</span>
                  <span className="price">R$ {(it.priceCents / 100).toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
