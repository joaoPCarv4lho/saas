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
    <main className="login-screen">
      <div className="ticket-card">
        <p className="ticket-mark">RESTAURANTE POS</p>
        <h1>Entrar</h1>
        <form
          className="ticket-form"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            className="field"
            placeholder="ID do restaurante"
            value={restaurantId}
            onChange={(e) => setRestaurantId(e.target.value)}
          />
          <input
            className="field"
            placeholder="ID do funcionario"
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
          />
          <input
            className="field mono"
            placeholder="PIN"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <button type="submit" className="btn btn-block">Entrar</button>
        </form>
        {error && <p role="alert" className="error-banner">{error}</p>}
        <hr className="tear-line" />
      </div>
    </main>
  );
}
