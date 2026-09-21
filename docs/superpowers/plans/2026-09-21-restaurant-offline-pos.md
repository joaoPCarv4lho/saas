# Restaurant Offline-First POS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MVP restaurant ordering system (Next.js PWA) that keeps working when internet drops and lets any device (phone or till) take over if another device dies.

**Architecture:** Next.js App Router app, single codebase deployed to Vercel, installable as a PWA on any device. Server-side: Next.js API routes + Prisma ORM. Client-side: every write goes to IndexedDB first (optimistic), then a mutation queue pushes to `/api/sync` when online; a pull step reconciles other devices' changes. Service worker caches the app shell so the app opens with zero network.

**Tech Stack:** Next.js (App Router, TypeScript), Prisma ORM, SQLite for local dev/test (file-based, zero infra), `idb` for client-side IndexedDB, `next-pwa`/Workbox for the service worker, Vitest for unit tests, Playwright for E2E (drives the same flows the Chrome browser-automation validation pass uses).

**Spec:** `docs/superpowers/specs/2026-09-21-restaurant-offline-pos-design.md`

## Global Constraints

- Single-tenant MVP — no multi-restaurant support.
- No real payment gateway — payments are a record only (method + amount).
- Conflict resolution is last-write-wins by `updatedAt` timestamp — documented limitation, no CRDT.
- Local dev/test database is SQLite via Prisma (`prisma/schema.prisma`, provider `sqlite`, file `prisma/dev.db`). **This is a deliberate scope cut**: Vercel Functions have no persistent disk, so production deploy needs a networked Postgres (Neon via Vercel Marketplace per the spec) — swapping `provider = "sqlite"` to `"postgresql"` and pointing `DATABASE_URL` at the provisioned Neon instance is a one-time manual step gated on the user's Vercel account login, out of scope for this plan's automated build/test loop. Flag it, don't block on it.
- All money values stored as integer cents (`*_centavos` in the spec maps to `*Cents` in code).
- Every task that touches `app/api/**` must keep routes framework-default Node.js runtime (no `runtime = 'edge'`).

---

## File Structure

```
package.json
prisma/schema.prisma
prisma/seed.ts
lib/db.ts                    # Prisma client singleton
lib/auth.ts                  # PIN verification + session cookie
lib/types.ts                 # Shared domain types (OrderStatus, Mutation, etc.)
app/api/auth/login/route.ts
app/api/menu/route.ts
app/api/orders/route.ts
app/api/orders/[id]/route.ts
app/api/sync/route.ts
lib/offline/db.ts            # IndexedDB schema + open()
lib/offline/queue.ts         # enqueueMutation / flushQueue
lib/offline/sync.ts          # syncNow (push + pull), online/offline listeners
app/login/page.tsx
app/comandas/page.tsx        # waiter order screen
app/comandas/[id]/page.tsx   # order detail / add items
app/kitchen/page.tsx         # kitchen view
app/admin/menu/page.tsx      # menu CRUD
public/manifest.json
next.config.ts               # next-pwa wiring
tests/unit/**                # Vitest
tests/e2e/**                 # Playwright
```

---

### Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `app/layout.tsx`, `app/page.tsx`
- Create: `vitest.config.ts`, `playwright.config.ts`

**Interfaces:**
- Produces: a running `next dev` app on `http://localhost:3000`, `npm test` (Vitest) and `npm run test:e2e` (Playwright) scripts.

- [ ] **Step 1: Scaffold Next.js app**

```bash
npx create-next-app@latest . --typescript --eslint --app --src-dir=false --import-alias "@/*" --no-tailwind --use-npm --yes
```

- [ ] **Step 2: Install core dependencies**

```bash
npm install prisma @prisma/client idb next-pwa
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @playwright/test tsx
```

- [ ] **Step 3: Add test scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true },
});
```

- [ ] **Step 5: Create `playwright.config.ts`**

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
  use: { baseURL: 'http://localhost:3000' },
});
```

- [ ] **Step 6: Verify dev server boots**

Run: `npm run dev -- --port 3100 &` then `curl -sf http://localhost:3100 > /dev/null && echo OK`, then stop the server.
Expected: `OK`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with test tooling"
```

---

### Task 2: Prisma schema, migration, seed

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, `lib/db.ts`, `lib/types.ts`
- Test: `tests/unit/schema.test.ts`

**Interfaces:**
- Consumes: nothing (foundational).
- Produces: `import { prisma } from '@/lib/db'`; Prisma models `Restaurant, Staff, MenuCategory, MenuItem, Order, OrderItem, Payment`; shared types in `lib/types.ts`:

```typescript
export type OrderStatus = 'open' | 'preparing' | 'ready' | 'delivered' | 'paid';
export type OrderItemStatus = 'pending' | 'preparing' | 'ready' | 'delivered';
export type PaymentMethod = 'cash' | 'card' | 'pix';
export type OrderLocationType = 'table' | 'counter';
```

- [ ] **Step 1: Write `prisma/schema.prisma`**

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Restaurant {
  id       String   @id @default(cuid())
  name     String
  pinHash  String
  staff    Staff[]
  categories MenuCategory[]
  orders   Order[]
}

model Staff {
  id           String     @id @default(cuid())
  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])
  name         String
  isAdmin      Boolean    @default(false)
  orders       Order[]
}

model MenuCategory {
  id           String     @id @default(cuid())
  restaurantId String
  restaurant   Restaurant @relation(fields: [restaurantId], references: [id])
  name         String
  sortOrder    Int        @default(0)
  items        MenuItem[]
}

model MenuItem {
  id          String       @id @default(cuid())
  categoryId  String
  category    MenuCategory @relation(fields: [categoryId], references: [id])
  name        String
  priceCents  Int
  available   Boolean      @default(true)
  orderItems  OrderItem[]
}

model Order {
  id             String      @id @default(cuid())
  restaurantId   String
  restaurant     Restaurant  @relation(fields: [restaurantId], references: [id])
  locationType   String      // OrderLocationType
  locationLabel  String      // table number or "balcao"
  status         String      // OrderStatus
  createdByStaffId String
  createdByStaff Staff       @relation(fields: [createdByStaffId], references: [id])
  deviceId       String
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  items          OrderItem[]
  payments       Payment[]
}

model OrderItem {
  id          String   @id @default(cuid())
  orderId     String
  order       Order    @relation(fields: [orderId], references: [id])
  menuItemId  String
  menuItem    MenuItem @relation(fields: [menuItemId], references: [id])
  quantity    Int
  note        String   @default("")
  status      String   // OrderItemStatus
  updatedAt   DateTime @updatedAt
}

model Payment {
  id         String   @id @default(cuid())
  orderId    String
  order      Order    @relation(fields: [orderId], references: [id])
  method     String   // PaymentMethod
  amountCents Int
  createdAt  DateTime @default(now())
}
```

- [ ] **Step 2: Write `lib/types.ts`** (content shown above under Interfaces)

- [ ] **Step 3: Write `lib/db.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Set `.env` and run migration**

```bash
echo 'DATABASE_URL="file:./dev.db"' > .env
npx prisma migrate dev --name init
```

Expected: migration applies, `prisma/dev.db` created.

- [ ] **Step 5: Write `prisma/seed.ts`**

```typescript
import { prisma } from '../lib/db';
import { createHash } from 'crypto';

async function main() {
  const pinHash = createHash('sha256').update('1234').digest('hex');
  const restaurant = await prisma.restaurant.create({
    data: { name: 'Restaurante Teste', pinHash },
  });
  const staff = await prisma.staff.create({
    data: { restaurantId: restaurant.id, name: 'Garcom Teste', isAdmin: true },
  });
  const category = await prisma.menuCategory.create({
    data: { restaurantId: restaurant.id, name: 'Bebidas', sortOrder: 0 },
  });
  await prisma.menuItem.create({
    data: { categoryId: category.id, name: 'Refrigerante', priceCents: 800, available: true },
  });
  console.log({ restaurantId: restaurant.id, staffId: staff.id });
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 6: Write `tests/unit/schema.test.ts`**

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../lib/db';

describe('prisma schema', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a restaurant with nested staff and menu', async () => {
    const restaurant = await prisma.restaurant.create({
      data: {
        name: 'Test',
        pinHash: 'x',
        staff: { create: { name: 'Alice' } },
      },
      include: { staff: true },
    });
    expect(restaurant.staff[0].name).toBe('Alice');
  });
});
```

- [ ] **Step 7: Run tests**

Run: `npm test -- tests/unit/schema.test.ts`
Expected: PASS.

- [ ] **Step 8: Seed and commit**

```bash
npm run db:seed
git add -A
git commit -m "feat: add Prisma schema, client, and seed data"
```

---

### Task 3: PIN auth (login + session)

**Files:**
- Create: `lib/auth.ts`, `app/api/auth/login/route.ts`
- Test: `tests/unit/auth.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db`.
- Produces:

```typescript
// lib/auth.ts
export function hashPin(pin: string): string;
export async function verifyLogin(restaurantId: string, pin: string, staffId: string): Promise<{ staffId: string; restaurantId: string } | null>;
export function sessionCookieValue(session: { staffId: string; restaurantId: string }): string;
export function parseSessionCookie(value: string | undefined): { staffId: string; restaurantId: string } | null;
```

- [ ] **Step 1: Write failing test `tests/unit/auth.test.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { hashPin, sessionCookieValue, parseSessionCookie } from '../../lib/auth';

describe('auth', () => {
  it('hashPin is deterministic', () => {
    expect(hashPin('1234')).toBe(hashPin('1234'));
    expect(hashPin('1234')).not.toBe(hashPin('4321'));
  });

  it('round-trips a session cookie', () => {
    const cookie = sessionCookieValue({ staffId: 's1', restaurantId: 'r1' });
    expect(parseSessionCookie(cookie)).toEqual({ staffId: 's1', restaurantId: 'r1' });
  });

  it('rejects a malformed cookie', () => {
    expect(parseSessionCookie('garbage')).toBeNull();
    expect(parseSessionCookie(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/auth.test.ts`
Expected: FAIL (`lib/auth.ts` not found).

- [ ] **Step 3: Implement `lib/auth.ts`**

```typescript
import { createHash } from 'crypto';
import { prisma } from './db';

export function hashPin(pin: string): string {
  return createHash('sha256').update(pin).digest('hex');
}

export function sessionCookieValue(session: { staffId: string; restaurantId: string }): string {
  return Buffer.from(JSON.stringify(session)).toString('base64url');
}

export function parseSessionCookie(value: string | undefined): { staffId: string; restaurantId: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed?.staffId === 'string' && typeof parsed?.restaurantId === 'string') return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function verifyLogin(restaurantId: string, pin: string, staffId: string) {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant || restaurant.pinHash !== hashPin(pin)) return null;
  const staff = await prisma.staff.findFirst({ where: { id: staffId, restaurantId } });
  if (!staff) return null;
  return { staffId: staff.id, restaurantId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/auth.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement `app/api/auth/login/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { verifyLogin, sessionCookieValue } from '@/lib/auth';

export async function POST(request: Request) {
  const { restaurantId, staffId, pin } = await request.json();
  const session = await verifyLogin(restaurantId, pin, staffId);
  if (!session) return NextResponse.json({ error: 'invalid credentials' }, { status: 401 });
  const response = NextResponse.json({ ok: true, session });
  response.cookies.set('session', sessionCookieValue(session), { httpOnly: true, sameSite: 'lax', path: '/' });
  return response;
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PIN login with session cookie"
```

---

### Task 4: Menu API (list + admin create/update)

**Files:**
- Create: `app/api/menu/route.ts`
- Test: `tests/unit/menu-api.test.ts`

**Interfaces:**
- Consumes: `prisma` from `lib/db`, `parseSessionCookie` from `lib/auth`.
- Produces: `GET /api/menu?restaurantId=` → `{ categories: Array<{ id, name, sortOrder, items: Array<{ id, name, priceCents, available }> }> }`; `POST /api/menu` (admin) body `{ restaurantId, categoryName, itemName, priceCents }` creates category-if-missing + item, returns created item.

- [ ] **Step 1: Write failing test `tests/unit/menu-api.test.ts`**

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../lib/db';
import { GET, POST } from '../../app/api/menu/route';

describe('menu API', () => {
  afterAll(() => prisma.$disconnect());

  it('creates and lists a menu item', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R', pinHash: 'x' } });

    const postRes = await POST(new Request('http://x/api/menu', {
      method: 'POST',
      body: JSON.stringify({ restaurantId: restaurant.id, categoryName: 'Bebidas', itemName: 'Suco', priceCents: 500 }),
    }));
    expect(postRes.status).toBe(201);

    const getRes = await GET(new Request(`http://x/api/menu?restaurantId=${restaurant.id}`));
    const body = await getRes.json();
    expect(body.categories[0].items[0].name).toBe('Suco');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/menu-api.test.ts`
Expected: FAIL (route file not found).

- [ ] **Step 3: Implement `app/api/menu/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const restaurantId = url.searchParams.get('restaurantId');
  if (!restaurantId) return NextResponse.json({ error: 'restaurantId required' }, { status: 400 });

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId },
    orderBy: { sortOrder: 'asc' },
    include: { items: true },
  });
  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  const { restaurantId, categoryName, itemName, priceCents } = await request.json();

  let category = await prisma.menuCategory.findFirst({ where: { restaurantId, name: categoryName } });
  if (!category) {
    category = await prisma.menuCategory.create({ data: { restaurantId, name: categoryName, sortOrder: 0 } });
  }

  const item = await prisma.menuItem.create({
    data: { categoryId: category.id, name: itemName, priceCents, available: true },
  });

  return NextResponse.json({ item }, { status: 201 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/menu-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add menu list/create API"
```

---

### Task 5: Orders API (create order, add item, get order)

**Files:**
- Create: `app/api/orders/route.ts`, `app/api/orders/[id]/route.ts`
- Test: `tests/unit/orders-api.test.ts`

**Interfaces:**
- Consumes: `prisma`, `OrderStatus`/`OrderItemStatus` from `lib/types`.
- Produces: `POST /api/orders` body `{ restaurantId, staffId, deviceId, locationType, locationLabel }` → `{ order }` (status `'open'`); `GET /api/orders/[id]` → `{ order }` with `items`; `PATCH /api/orders/[id]` body `{ addItem?: { menuItemId, quantity, note }, status? }` → `{ order }`.

- [ ] **Step 1: Write failing test `tests/unit/orders-api.test.ts`**

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../lib/db';
import { POST as createOrder } from '../../app/api/orders/route';
import { PATCH, GET } from '../../app/api/orders/[id]/route';

describe('orders API', () => {
  afterAll(() => prisma.$disconnect());

  it('creates an order and adds an item', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R', pinHash: 'x' } });
    const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'S' } });
    const category = await prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'C', sortOrder: 0 } });
    const menuItem = await prisma.menuItem.create({ data: { categoryId: category.id, name: 'Item', priceCents: 100, available: true } });

    const createRes = await createOrder(new Request('http://x/api/orders', {
      method: 'POST',
      body: JSON.stringify({ restaurantId: restaurant.id, staffId: staff.id, deviceId: 'd1', locationType: 'table', locationLabel: '5' }),
    }));
    expect(createRes.status).toBe(201);
    const { order } = await createRes.json();
    expect(order.status).toBe('open');

    const patchRes = await PATCH(new Request(`http://x/api/orders/${order.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ addItem: { menuItemId: menuItem.id, quantity: 2, note: '' } }),
    }), { params: Promise.resolve({ id: order.id }) });
    expect(patchRes.status).toBe(200);

    const getRes = await GET(new Request(`http://x/api/orders/${order.id}`), { params: Promise.resolve({ id: order.id }) });
    const body = await getRes.json();
    expect(body.order.items).toHaveLength(1);
    expect(body.order.items[0].quantity).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/orders-api.test.ts`
Expected: FAIL (route files not found).

- [ ] **Step 3: Implement `app/api/orders/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  const { restaurantId, staffId, deviceId, locationType, locationLabel } = await request.json();
  const order = await prisma.order.create({
    data: {
      restaurantId,
      createdByStaffId: staffId,
      deviceId,
      locationType,
      locationLabel,
      status: 'open',
    },
  });
  return NextResponse.json({ order }, { status: 201 });
}
```

- [ ] **Step 4: Implement `app/api/orders/[id]/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true, payments: true } });
  if (!order) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ order });
}

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const body = await request.json();

  if (body.addItem) {
    await prisma.orderItem.create({
      data: {
        orderId: id,
        menuItemId: body.addItem.menuItemId,
        quantity: body.addItem.quantity,
        note: body.addItem.note ?? '',
        status: 'pending',
      },
    });
  }

  if (body.status) {
    await prisma.order.update({ where: { id }, data: { status: body.status } });
  }

  const order = await prisma.order.findUnique({ where: { id }, include: { items: true, payments: true } });
  return NextResponse.json({ order });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/unit/orders-api.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add orders create/get/patch API"
```

---

### Task 6: Payments API

**Files:**
- Create: `app/api/orders/[id]/pay/route.ts`
- Test: `tests/unit/payments-api.test.ts`

**Interfaces:**
- Consumes: `prisma`, `PaymentMethod` from `lib/types`.
- Produces: `POST /api/orders/[id]/pay` body `{ method, amountCents }` → creates `Payment`, sets order `status = 'paid'`, returns `{ order, payment }`.

- [ ] **Step 1: Write failing test `tests/unit/payments-api.test.ts`**

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../lib/db';
import { POST } from '../../app/api/orders/[id]/pay/route';

describe('payments API', () => {
  afterAll(() => prisma.$disconnect());

  it('records a payment and marks order paid', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R', pinHash: 'x' } });
    const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'S' } });
    const order = await prisma.order.create({
      data: { restaurantId: restaurant.id, createdByStaffId: staff.id, deviceId: 'd1', locationType: 'counter', locationLabel: 'balcao', status: 'delivered' },
    });

    const res = await POST(new Request(`http://x/api/orders/${order.id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ method: 'pix', amountCents: 1500 }),
    }), { params: Promise.resolve({ id: order.id }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.order.status).toBe('paid');
    expect(body.payment.method).toBe('pix');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/payments-api.test.ts`
Expected: FAIL (route file not found).

- [ ] **Step 3: Implement `app/api/orders/[id]/pay/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { method, amountCents } = await request.json();

  const payment = await prisma.payment.create({ data: { orderId: id, method, amountCents } });
  const order = await prisma.order.update({ where: { id }, data: { status: 'paid' }, include: { items: true, payments: true } });

  return NextResponse.json({ order, payment });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/payments-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add payment recording API"
```

---

### Task 7: Offline IndexedDB layer + mutation queue

**Files:**
- Create: `lib/offline/db.ts`, `lib/offline/queue.ts`
- Test: `tests/unit/offline-queue.test.ts`

**Interfaces:**
- Produces:

```typescript
// lib/offline/db.ts
export interface Mutation {
  id: string;
  entity: 'order' | 'orderItem' | 'payment';
  entityId: string;
  op: 'create' | 'update';
  payload: Record<string, unknown>;
  updatedAt: string;
}
export function openOfflineDb(): Promise<IDBPDatabase>;

// lib/offline/queue.ts
export async function enqueueMutation(db: IDBPDatabase, mutation: Mutation): Promise<void>;
export async function listPendingMutations(db: IDBPDatabase): Promise<Mutation[]>;
export async function clearMutation(db: IDBPDatabase, mutationId: string): Promise<void>;
```

- [ ] **Step 1: Write failing test `tests/unit/offline-queue.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { openOfflineDb } from '../../lib/offline/db';
import { enqueueMutation, listPendingMutations, clearMutation } from '../../lib/offline/queue';

describe('offline mutation queue', () => {
  it('enqueues, lists, and clears mutations in order', async () => {
    const db = await openOfflineDb();
    await enqueueMutation(db, { id: 'm1', entity: 'order', entityId: 'o1', op: 'create', payload: {}, updatedAt: '2026-01-01T00:00:00Z' });
    await enqueueMutation(db, { id: 'm2', entity: 'orderItem', entityId: 'oi1', op: 'create', payload: {}, updatedAt: '2026-01-01T00:00:01Z' });

    const pending = await listPendingMutations(db);
    expect(pending.map((m) => m.id)).toEqual(['m1', 'm2']);

    await clearMutation(db, 'm1');
    expect((await listPendingMutations(db)).map((m) => m.id)).toEqual(['m2']);
  });
});
```

- [ ] **Step 2: Install `fake-indexeddb` for jsdom test environment**

```bash
npm install -D fake-indexeddb
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/unit/offline-queue.test.ts`
Expected: FAIL (`lib/offline/db.ts` not found).

- [ ] **Step 4: Implement `lib/offline/db.ts`**

```typescript
import { openDB, type IDBPDatabase } from 'idb';

export interface Mutation {
  id: string;
  entity: 'order' | 'orderItem' | 'payment';
  entityId: string;
  op: 'create' | 'update';
  payload: Record<string, unknown>;
  updatedAt: string;
}

const DB_NAME = 'restaurant-offline';
const DB_VERSION = 1;

export function openOfflineDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('mutationQueue', { keyPath: 'id' });
      db.createObjectStore('orders', { keyPath: 'id' });
      db.createObjectStore('menu', { keyPath: 'id' });
    },
  });
}
```

- [ ] **Step 5: Implement `lib/offline/queue.ts`**

```typescript
import type { IDBPDatabase } from 'idb';
import type { Mutation } from './db';

export async function enqueueMutation(db: IDBPDatabase, mutation: Mutation): Promise<void> {
  await db.put('mutationQueue', mutation);
}

export async function listPendingMutations(db: IDBPDatabase): Promise<Mutation[]> {
  const all = await db.getAll('mutationQueue');
  return all.sort((a: Mutation, b: Mutation) => a.updatedAt.localeCompare(b.updatedAt));
}

export async function clearMutation(db: IDBPDatabase, mutationId: string): Promise<void> {
  await db.delete('mutationQueue', mutationId);
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/unit/offline-queue.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add IndexedDB offline layer and mutation queue"
```

---

### Task 8: Sync API endpoint (last-write-wins)

**Files:**
- Create: `app/api/sync/route.ts`
- Test: `tests/unit/sync-api.test.ts`

**Interfaces:**
- Consumes: `Mutation` type (mirrors `lib/offline/db.ts`'s shape — duplicated as a plain type here since API routes run server-side, not importing client IndexedDB code), `prisma`.
- Produces: `POST /api/sync` body `{ mutations: Mutation[] }` → `{ applied: string[]; rejected: string[] }`. For each mutation, applies it only if no existing record has a newer `updatedAt` (last-write-wins); `orderItem` create mutations always apply (they are additive, not conflicting).

- [ ] **Step 1: Write failing test `tests/unit/sync-api.test.ts`**

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { prisma } from '../../lib/db';
import { POST } from '../../app/api/sync/route';

describe('sync API', () => {
  afterAll(() => prisma.$disconnect());

  it('applies a status update when the mutation is newer than server state', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R', pinHash: 'x' } });
    const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'S' } });
    const order = await prisma.order.create({
      data: { restaurantId: restaurant.id, createdByStaffId: staff.id, deviceId: 'd1', locationType: 'counter', locationLabel: 'balcao', status: 'open' },
    });

    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await POST(new Request('http://x/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        mutations: [{ id: 'm1', entity: 'order', entityId: order.id, op: 'update', payload: { status: 'preparing' }, updatedAt: future }],
      }),
    }));

    const body = await res.json();
    expect(body.applied).toEqual(['m1']);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated?.status).toBe('preparing');
  });

  it('rejects a mutation older than current server state', async () => {
    const restaurant = await prisma.restaurant.create({ data: { name: 'R2', pinHash: 'x' } });
    const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'S' } });
    const order = await prisma.order.create({
      data: { restaurantId: restaurant.id, createdByStaffId: staff.id, deviceId: 'd1', locationType: 'counter', locationLabel: 'balcao', status: 'ready' },
    });

    const past = new Date(Date.now() - 60_000).toISOString();
    const res = await POST(new Request('http://x/api/sync', {
      method: 'POST',
      body: JSON.stringify({
        mutations: [{ id: 'm2', entity: 'order', entityId: order.id, op: 'update', payload: { status: 'preparing' }, updatedAt: past }],
      }),
    }));

    const body = await res.json();
    expect(body.rejected).toEqual(['m2']);

    const unchanged = await prisma.order.findUnique({ where: { id: order.id } });
    expect(unchanged?.status).toBe('ready');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/sync-api.test.ts`
Expected: FAIL (route file not found).

- [ ] **Step 3: Implement `app/api/sync/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface Mutation {
  id: string;
  entity: 'order' | 'orderItem' | 'payment';
  entityId: string;
  op: 'create' | 'update';
  payload: Record<string, unknown>;
  updatedAt: string;
}

export async function POST(request: Request) {
  const { mutations } = (await request.json()) as { mutations: Mutation[] };
  const applied: string[] = [];
  const rejected: string[] = [];

  for (const mutation of mutations) {
    if (mutation.entity === 'order' && mutation.op === 'update') {
      const current = await prisma.order.findUnique({ where: { id: mutation.entityId } });
      if (!current || new Date(mutation.updatedAt) <= current.updatedAt) {
        rejected.push(mutation.id);
        continue;
      }
      await prisma.order.update({ where: { id: mutation.entityId }, data: mutation.payload });
      applied.push(mutation.id);
    } else if (mutation.entity === 'orderItem' && mutation.op === 'create') {
      await prisma.orderItem.create({ data: mutation.payload as never });
      applied.push(mutation.id);
    } else {
      rejected.push(mutation.id);
    }
  }

  return NextResponse.json({ applied, rejected });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/sync-api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add last-write-wins sync API"
```

---

### Task 9: Client sync engine

**Files:**
- Create: `lib/offline/sync.ts`
- Test: `tests/unit/sync-client.test.ts`

**Interfaces:**
- Consumes: `openOfflineDb` from `lib/offline/db`, `listPendingMutations`/`clearMutation` from `lib/offline/queue`.
- Produces:

```typescript
// lib/offline/sync.ts
export async function syncNow(db: IDBPDatabase, fetchImpl: typeof fetch): Promise<{ applied: string[]; rejected: string[] }>;
export function startAutoSync(db: IDBPDatabase, intervalMs?: number): () => void; // returns stop function, listens to 'online' event too
```

- [ ] **Step 1: Write failing test `tests/unit/sync-client.test.ts`**

```typescript
import { describe, it, expect, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { openOfflineDb } from '../../lib/offline/db';
import { enqueueMutation } from '../../lib/offline/queue';
import { syncNow } from '../../lib/offline/sync';

describe('syncNow', () => {
  it('pushes pending mutations and clears the ones the server applied', async () => {
    const db = await openOfflineDb();
    await enqueueMutation(db, { id: 'm1', entity: 'order', entityId: 'o1', op: 'update', payload: { status: 'preparing' }, updatedAt: '2026-01-01T00:00:00Z' });

    const fetchImpl = vi.fn().mockResolvedValue({
      json: async () => ({ applied: ['m1'], rejected: [] }),
    });

    const result = await syncNow(db, fetchImpl as unknown as typeof fetch);

    expect(result.applied).toEqual(['m1']);
    expect(fetchImpl).toHaveBeenCalledWith('/api/sync', expect.objectContaining({ method: 'POST' }));
    const remaining = await db.getAll('mutationQueue');
    expect(remaining).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/unit/sync-client.test.ts`
Expected: FAIL (`lib/offline/sync.ts` not found).

- [ ] **Step 3: Implement `lib/offline/sync.ts`**

```typescript
import type { IDBPDatabase } from 'idb';
import { listPendingMutations, clearMutation } from './queue';

export async function syncNow(db: IDBPDatabase, fetchImpl: typeof fetch = fetch) {
  const mutations = await listPendingMutations(db);
  if (mutations.length === 0) return { applied: [], rejected: [] };

  const response = await fetchImpl('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mutations }),
  });
  const result = (await response.json()) as { applied: string[]; rejected: string[] };

  for (const id of [...result.applied, ...result.rejected]) {
    await clearMutation(db, id);
  }

  return result;
}

export function startAutoSync(db: IDBPDatabase, intervalMs = 15000): () => void {
  const tick = () => void syncNow(db);
  const interval = setInterval(tick, intervalMs);
  window.addEventListener('online', tick);
  return () => {
    clearInterval(interval);
    window.removeEventListener('online', tick);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/unit/sync-client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add client sync engine with auto-sync on reconnect"
```

---

### Task 10: PWA shell (manifest + service worker + installability)

**Files:**
- Create: `public/manifest.json`, `public/icon-192.png`, `public/icon-512.png`
- Modify: `next.config.ts`, `app/layout.tsx`

**Interfaces:**
- Produces: app is installable ("Add to Home Screen"), `next-pwa` generates `public/sw.js` at build time caching the app shell for offline boot.

- [ ] **Step 1: Install and wire `next-pwa` in `next.config.ts`**

```typescript
import type { NextConfig } from 'next';
import withPWA from 'next-pwa';

const nextConfig: NextConfig = {};

export default withPWA({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
})(nextConfig);
```

- [ ] **Step 2: Write `public/manifest.json`**

```json
{
  "name": "Restaurante POS",
  "short_name": "POS",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111111",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 3: Generate placeholder icons**

```bash
node -e "
const fs = require('fs');
const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
fs.writeFileSync('public/icon-192.png', png1x1);
fs.writeFileSync('public/icon-512.png', png1x1);
"
```

- [ ] **Step 4: Link manifest in `app/layout.tsx`**

```typescript
export const metadata = {
  title: 'Restaurante POS',
  manifest: '/manifest.json',
};
```

- [ ] **Step 5: Build and verify service worker output**

Run: `npm run build`
Expected: build succeeds; `public/sw.js` exists after build.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add PWA manifest and service worker"
```

---

### Task 11: Waiter UI — login, comandas list, order detail

**Files:**
- Create: `app/login/page.tsx`, `app/comandas/page.tsx`, `app/comandas/[id]/page.tsx`
- Test: `tests/e2e/waiter-flow.spec.ts`

**Interfaces:**
- Consumes: `/api/auth/login`, `/api/orders`, `/api/orders/[id]`, `/api/menu`, `openOfflineDb`/`enqueueMutation`/`syncNow` from `lib/offline/*`.
- Produces: pages reachable at `/login`, `/comandas`, `/comandas/[id]`.

- [ ] **Step 1: Implement `app/login/page.tsx`**

```typescript
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
```

- [ ] **Step 2: Implement `app/comandas/page.tsx`**

```typescript
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface OrderSummary { id: string; locationLabel: string; status: string; }

export default function ComandasPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [locationLabel, setLocationLabel] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch('/api/orders').then((r) => r.json()).then((d) => setOrders(d.orders ?? []));
  }, []);

  async function createOrder() {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationType: 'table', locationLabel }),
    });
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
```

- [ ] **Step 3: Extend `app/api/orders/route.ts` with session-aware `GET` and cookie-derived `POST` fields**

Modify `app/api/orders/route.ts` to add:

```typescript
import { parseSessionCookie } from '@/lib/auth';
import { cookies } from 'next/headers';

export async function GET() {
  const session = parseSessionCookie((await cookies()).get('session')?.value);
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const orders = await prisma.order.findMany({ where: { restaurantId: session.restaurantId }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ orders });
}
```

And change `POST` to read `staffId`/`restaurantId` from the session cookie instead of the request body (`deviceId` stays client-supplied — generate it client-side with `crypto.randomUUID()` stored in `localStorage`).

- [ ] **Step 4: Implement `app/comandas/[id]/page.tsx`**

```typescript
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
```

- [ ] **Step 5: Write `tests/e2e/waiter-flow.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test('waiter creates a comanda and adds an item', async ({ page, request }) => {
  const seedRes = await request.get('/api/test/seed'); // seeds a fresh restaurant/staff/menu item for test isolation
  const { restaurantId, staffId, menuItemName } = await seedRes.json();

  await page.goto('/login');
  await page.getByPlaceholder('ID do restaurante').fill(restaurantId);
  await page.getByPlaceholder('ID do funcionario').fill(staffId);
  await page.getByPlaceholder('PIN').fill('1234');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/comandas/);

  await page.getByPlaceholder('Mesa').fill('7');
  await page.getByRole('button', { name: 'Nova comanda' }).click();
  await expect(page.getByRole('heading', { name: /Comanda/ })).toBeVisible();

  await page.getByRole('button', { name: new RegExp(menuItemName) }).click();
  await expect(page.getByText(new RegExp(`1x`))).toBeVisible();
});
```

This test depends on a `/api/test/seed` helper route — add it in this task at `app/api/test/seed/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPin } from '@/lib/auth';

export async function GET() {
  const restaurant = await prisma.restaurant.create({ data: { name: 'E2E', pinHash: hashPin('1234') } });
  const staff = await prisma.staff.create({ data: { restaurantId: restaurant.id, name: 'E2E Staff' } });
  const category = await prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: 'E2E Cat', sortOrder: 0 } });
  const item = await prisma.menuItem.create({ data: { categoryId: category.id, name: 'ItemE2E', priceCents: 100, available: true } });
  return NextResponse.json({ restaurantId: restaurant.id, staffId: staff.id, menuItemName: item.name });
}
```

- [ ] **Step 6: Run E2E test**

Run: `npm run test:e2e -- tests/e2e/waiter-flow.spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add waiter login, comandas, and order detail pages"
```

---

### Task 12: Kitchen view + admin menu UI

**Files:**
- Create: `app/kitchen/page.tsx`, `app/admin/menu/page.tsx`
- Test: `tests/e2e/kitchen-flow.spec.ts`

**Interfaces:**
- Consumes: `/api/orders`, `/api/orders/[id]` (PATCH `status`), `/api/menu` (GET/POST).

- [ ] **Step 1: Implement `app/kitchen/page.tsx`**

```typescript
'use client';
import { useEffect, useState } from 'react';

interface KitchenOrder { id: string; locationLabel: string; status: string; }

export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);

  async function refresh() {
    const res = await fetch('/api/orders');
    const data = await res.json();
    setOrders((data.orders ?? []).filter((o: KitchenOrder) => ['open', 'preparing'].includes(o.status)));
  }

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, []);

  async function markReady(id: string) {
    await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'ready' }),
    });
    refresh();
  }

  return (
    <main>
      <h1>Cozinha</h1>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            {o.locationLabel} — {o.status}
            <button onClick={() => markReady(o.id)}>Marcar pronto</button>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Implement `app/admin/menu/page.tsx`**

```typescript
'use client';
import { useEffect, useState } from 'react';

interface Category { id: string; name: string; items: { id: string; name: string; priceCents: number }[]; }

export default function AdminMenuPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [itemName, setItemName] = useState('');
  const [priceCents, setPriceCents] = useState(0);

  async function refresh() {
    const res = await fetch('/api/menu');
    setCategories((await res.json()).categories ?? []);
  }

  useEffect(() => { refresh(); }, []);

  async function addItem() {
    await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categoryName, itemName, priceCents }),
    });
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
```

- [ ] **Step 3: Wire `/api/menu` GET to read `restaurantId` from the session cookie** (same pattern as Task 11 Step 3) instead of a query param, so the admin/kitchen pages don't need to pass it manually.

- [ ] **Step 4: Write `tests/e2e/kitchen-flow.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test('kitchen marks an order ready', async ({ page, request }) => {
  const seedRes = await request.get('/api/test/seed');
  const { restaurantId, staffId } = await seedRes.json();

  await page.goto('/login');
  await page.getByPlaceholder('ID do restaurante').fill(restaurantId);
  await page.getByPlaceholder('ID do funcionario').fill(staffId);
  await page.getByPlaceholder('PIN').fill('1234');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.goto('/comandas');
  await page.getByPlaceholder('Mesa').fill('3');
  await page.getByRole('button', { name: 'Nova comanda' }).click();

  await page.goto('/kitchen');
  await expect(page.getByText(/3 — open/)).toBeVisible();
  await page.getByRole('button', { name: 'Marcar pronto' }).click();
  await expect(page.getByText(/3 — ready/)).toBeVisible();
});
```

- [ ] **Step 5: Run E2E test**

Run: `npm run test:e2e -- tests/e2e/kitchen-flow.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add kitchen view and admin menu page"
```

---

### Task 13: Offline E2E validation (the core resilience requirement)

**Files:**
- Create: `tests/e2e/offline-resilience.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–12. No production code changes expected; this task proves the spec's "Critério de pronto" (Section 8 of the spec).

- [ ] **Step 1: Write `tests/e2e/offline-resilience.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test('order flow survives going offline mid-comanda and syncs on reconnect', async ({ page, context, request }) => {
  const seedRes = await request.get('/api/test/seed');
  const { restaurantId, staffId, menuItemName } = await seedRes.json();

  await page.goto('/login');
  await page.getByPlaceholder('ID do restaurante').fill(restaurantId);
  await page.getByPlaceholder('ID do funcionario').fill(staffId);
  await page.getByPlaceholder('PIN').fill('1234');
  await page.getByRole('button', { name: 'Entrar' }).click();

  await page.goto('/comandas');
  await page.getByPlaceholder('Mesa').fill('9');
  await page.getByRole('button', { name: 'Nova comanda' }).click();
  const url = page.url();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Comanda/ })).toBeVisible();

  await context.setOffline(false);
  await page.goto(url);
  await page.getByRole('button', { name: new RegExp(menuItemName) }).click();
  await expect(page.getByText(/1x/)).toBeVisible();
});
```

- [ ] **Step 2: Run test**

Run: `npm run test:e2e -- tests/e2e/offline-resilience.spec.ts`
Expected: PASS. If the offline reload fails to render (service worker not caching the shell yet), fix `next.config.ts`'s `next-pwa` `runtimeCaching` config from Task 10 rather than weakening this test.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add offline-resilience end-to-end coverage"
```

---

### Task 14: README + manual validation checklist

**Files:**
- Create: `README.md`

**Interfaces:**
- None (documentation only).

- [ ] **Step 1: Write `README.md`** covering: `npm install`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`, `npm test`, `npm run test:e2e`, and a manual smoke-test checklist matching the spec's Section 8 ("Critério de pronto"): full flow online; full flow with DevTools offline; two browser profiles (simulating till + phone) converge after reconnect; production deploy needs Vercel Postgres (Neon) provisioned via the user's Vercel account — documented as the one manual follow-up step, with the exact schema change (`provider = "postgresql"` in `prisma/schema.prisma` + `DATABASE_URL`).

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "docs: add README with setup and validation checklist"
```

---

## Self-Review Notes

- **Spec coverage:** login/PIN → Task 3; cardápio → Tasks 4, 12; comandas/items/status → Tasks 5, 11; cozinha → Task 12; pagamento → Task 6; offline completo + sync → Tasks 7, 8, 9, 13; PWA instalável → Task 10; critério de pronto → Tasks 13, 14.
- **Parallelization for subagent-driven-development:** Tasks 1→2 are strictly sequential (scaffold before schema). After Task 2, Tasks 3, 4 are independent of each other and can run in parallel. Task 5 depends on Task 2 only (not 3/4) and can run alongside them. Task 6 depends on Task 5. Task 7 (offline client layer) is independent of Tasks 3–6 and can run in parallel with all of them once Task 1 is done. Task 8 depends on Task 2 (schema) only. Task 9 depends on Tasks 7 and 8. Task 10 is independent of everything except Task 1. Tasks 11 and 12 depend on Tasks 3–9 being done (they wire the UI to those APIs) — run sequentially after that group, or split 11/12 in parallel since they touch disjoint files. Task 13 depends on 10, 11, 12. Task 14 depends on everything.
- **Type consistency check:** `OrderStatus`/`OrderItemStatus`/`PaymentMethod` string literals used consistently across Tasks 2, 5, 6, 8, 12. `Mutation` shape matches between `lib/offline/db.ts` (Task 7) and the server-side duplicate in `app/api/sync/route.ts` (Task 8) — both use `{ id, entity, entityId, op, payload, updatedAt }`.
