'use client';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';

interface MenuCategory { items: { id: string; name: string; priceCents: number }[]; }
interface OrderItem { id: string; menuItemId: string; quantity: number; }
interface OrderDetail { id: string; status: string; locationLabel: string; items: OrderItem[]; }

const METHODS = [
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao', label: 'Cartao' },
  { value: 'pix', label: 'Pix' },
];

export default function CaixaOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [menuItems, setMenuItems] = useState<Record<string, { name: string; priceCents: number }>>({});
  const [method, setMethod] = useState('dinheiro');
  const router = useRouter();

  async function refresh() {
    const res = await fetch(`/api/orders/${id}`);
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    setOrder((await res.json()).order);
  }

  useEffect(() => {
    refresh();
    fetch('/api/menu').then((r) => r.json()).then((d) => {
      const map: Record<string, { name: string; priceCents: number }> = {};
      for (const c of (d.categories ?? []) as MenuCategory[]) {
        for (const item of c.items) map[item.id] = { name: item.name, priceCents: item.priceCents };
      }
      setMenuItems(map);
    });
  }, [id]);

  if (!order) return <main className="screen"><p className="empty-note">Carregando...</p></main>;

  const totalCents = order.items.reduce((sum, i) => sum + (menuItems[i.menuItemId]?.priceCents ?? 0) * i.quantity, 0);

  async function registerPayment() {
    const res = await fetch(`/api/orders/${id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, amountCents: totalCents }),
    });
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    refresh();
  }

  return (
    <main className="screen">
      <div className="receipt-head">
        <h1>Caixa — Mesa {order.locationLabel}</h1>
        <span className="chip" data-status={order.status}>{order.status}</span>
      </div>

      <ul className="receipt-lines">
        {order.items.map((i) => {
          const menuItem = menuItems[i.menuItemId];
          const lineTotal = (menuItem?.priceCents ?? 0) * i.quantity;
          return (
            <li key={i.id} className="receipt-line">
              <span className="qty">{i.quantity}x</span>
              <span className="name">{menuItem?.name ?? i.menuItemId}</span>
              <span className="leader" />
              <span className="price">R$ {(lineTotal / 100).toFixed(2)}</span>
            </li>
          );
        })}
      </ul>

      <div className="pay-total">
        <span>Total</span>
        <span className="mono">R$ {(totalCents / 100).toFixed(2)}</span>
      </div>

      {order.status === 'paid' ? (
        <p className="empty-note" style={{ padding: '18px 0' }}>Comanda paga.</p>
      ) : (
        <div className="menu-section">
          <h2>Forma de pagamento</h2>
          <div className="pay-methods">
            {METHODS.map((m) => (
              <button
                key={m.value}
                className={`btn ${method === m.value ? '' : 'btn-outline'}`}
                onClick={() => setMethod(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button className="btn btn-block" style={{ marginTop: 14 }} onClick={registerPayment}>
            Registrar pagamento
          </button>
        </div>
      )}
    </main>
  );
}
