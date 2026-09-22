'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface OrderSummary { id: string; locationLabel: string; status: string; }

export default function CaixaPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/orders').then((r) => {
      if (r.status === 401) {
        router.push('/login');
        return null;
      }
      return r.json();
    }).then((d) => {
      const open = (d?.orders ?? []).filter((o: OrderSummary) => o.status !== 'paid' && o.status !== 'cancelled');
      setOrders(open);
    });
  }, [router]);

  return (
    <main className="screen">
      <div className="screen-head">
        <h1>Caixa</h1>
        <span className="count mono">{orders.length} em aberto</span>
      </div>

      {orders.length === 0 ? (
        <p className="empty-note">Nenhuma comanda para fechar.</p>
      ) : (
        <ul className="stub-list">
          {orders.map((o) => (
            <li key={o.id}>
              <a className="stub" href={`/caixa/${o.id}`}>
                <span className="stub-table mono">{o.locationLabel}</span>
                <span className="stub-label">Mesa {o.locationLabel}</span>
                <span className="chip" data-status={o.status}>{o.status}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
