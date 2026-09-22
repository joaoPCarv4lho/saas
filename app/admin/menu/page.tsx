'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Category { id: string; name: string; items: { id: string; name: string; priceCents: number }[]; }

export default function AdminMenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [itemName, setItemName] = useState('');
  const [priceCents, setPriceCents] = useState(0);
  const router = useRouter();

  async function refresh() {
    const res = await fetch('/api/menu');
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    setCategories((await res.json()).categories ?? []);
  }

  useEffect(() => { refresh(); }, []);

  async function addItem() {
    const res = await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryName, itemName, priceCents }),
    });
    if (res.status === 401) {
      router.push('/login');
      return;
    }
    setItemName('');
    setPriceCents(0);
    refresh();
  }

  return (
    <main className="screen">
      <div className="screen-head">
        <h1>Cardapio</h1>
        <span className="count mono">admin</span>
      </div>

      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          addItem();
        }}
      >
        <input className="field" placeholder="Categoria" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
        <input className="field" placeholder="Item" value={itemName} onChange={(e) => setItemName(e.target.value)} />
        <input
          className="field mono"
          placeholder="Preco (centavos)"
          type="number"
          value={priceCents}
          onChange={(e) => setPriceCents(Number(e.target.value))}
        />
        <button type="submit" className="btn">Adicionar</button>
      </form>

      {categories.length === 0 ? (
        <p className="empty-note">Nenhum item cadastrado ainda.</p>
      ) : (
        categories.map((c) => (
          <div key={c.id} className="admin-category">
            <h2>{c.name}</h2>
            {c.items.map((i) => (
              <div key={i.id} className="admin-item-row">
                <span>{i.name}</span>
                <span className="price">R$ {(i.priceCents / 100).toFixed(2)}</span>
              </div>
            ))}
          </div>
        ))
      )}
    </main>
  );
}
