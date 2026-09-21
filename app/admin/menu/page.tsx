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
    <main>
      <h1>Cardapio (admin)</h1>
      <input placeholder="Categoria" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
      <input placeholder="Item" value={itemName} onChange={(e) => setItemName(e.target.value)} />
      <input placeholder="Preco (centavos)" type="number" value={priceCents} onChange={(e) => setPriceCents(Number(e.target.value))} />
      <button onClick={addItem}>Adicionar</button>
      {categories.map((c) => (
        <div key={c.id}>
          <h2>{c.name}</h2>
          <ul>{c.items.map((i) => <li key={i.id}>{i.name} — R$ {(i.priceCents / 100).toFixed(2)}</li>)}</ul>
        </div>
      ))}
    </main>
  );
}
