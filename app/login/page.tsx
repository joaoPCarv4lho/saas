'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [restaurantId, setRestaurantId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit() {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantId, staffId, pin }),
    });
    if (!res.ok) {
      setError('PIN invalido');
      return;
    }
    router.push('/comandas');
  }

  return (
    <main>
      <h1>Entrar</h1>
      <input placeholder="ID do restaurante" value={restaurantId} onChange={(e) => setRestaurantId(e.target.value)} />
      <input placeholder="ID do funcionario" value={staffId} onChange={(e) => setStaffId(e.target.value)} />
      <input placeholder="PIN" type="password" value={pin} onChange={(e) => setPin(e.target.value)} />
      <button onClick={submit}>Entrar</button>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
