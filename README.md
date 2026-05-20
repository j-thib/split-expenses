# SplitFree

> Split expenses with friends. Always free.

A free, installable Splitwise alternative built as a Progressive Web App. Create a group, share an invite code, log who paid for what, and let the greedy-pairing algorithm settle everyone up in at most `k-1` transfers for `k` people.

- 💸 Expense logging with custom splits
- 🤝 Groups joined by 6-character invite codes
- 🧮 Optimal-ish debt settlement (greedy pairing, integer-cent precision)
- 📱 Installable PWA — works offline once loaded
- 🌱 No fees, no ads, no premium tier

Backed by [Supabase](https://supabase.com) (Postgres + Auth) on the free tier; hostable for $0 on Vercel/Netlify/Cloudflare Pages.

---

## Tech stack

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS v4**
- **vite-plugin-pwa** (Workbox service worker + manifest)
- **Supabase** (`@supabase/supabase-js`) for auth + Postgres
- **Vitest** for unit tests
- The original Streamlit prototype lives in `legacy/`

## Project layout

```
src/
  components/    Spinner, Sheet (bottom-sheet modal)
  contexts/      AuthContext, ToastContext
  lib/           supabase client, generated types, settlement algorithm
  pages/         AuthPage, GroupListPage, GroupDetailPage, GroupSettingsPage
supabase/
  schema.sql     Tables, indexes, RLS policies, RPCs — apply once per project
legacy/          The original Python/Streamlit version
```

## Setup

### 1. Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. In the project dashboard, open **SQL Editor → New query** and paste the contents of [`supabase/schema.sql`](./supabase/schema.sql). Run it. (Idempotent — safe to re-run after schema edits.)
3. In **Authentication → Providers**, enable **Email**. If you want frictionless local testing, also toggle off "Confirm email" while developing.
4. In **Project Settings → API**, copy the **Project URL** and the **anon public** key.

### 2. Environment variables

```sh
cp .env.example .env
```

Fill in the two values:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

The `anon` key is safe to ship in the client bundle — all access is gated by Row Level Security defined in `schema.sql`.

### 3. Install + run

```sh
npm install
npm run dev          # local dev server with HMR
npm run build        # production build to dist/
npm run preview      # preview the production build
npm test             # vitest run (unit tests for the settlement algorithm)
```

Open [http://localhost:5173](http://localhost:5173), sign up, and create a group.

## Deploying

The app is a static SPA. Any static host works.

### Vercel

```sh
npx vercel
```

When prompted, set the two `VITE_SUPABASE_*` env vars in the project settings. Vercel auto-detects Vite (`npm run build`, `dist/`).

### Netlify

```sh
npx netlify deploy --build
```

Same env vars. Build command `npm run build`, publish directory `dist`.

### Anywhere else

```sh
npm run build
# upload dist/ to S3 / Cloudflare Pages / GitHub Pages / your favorite host
```

Two things to set wherever you deploy:

- **Environment variables**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` must be set at build time (Vite inlines them into the bundle).
- **SPA fallback**: serve `dist/index.html` for any unknown path. Vercel and Netlify do this automatically; if you're hosting elsewhere you may need to configure it.

## How the settlement math works

For each group member we compute their **net balance** (sum of what they paid − sum of their share across all expenses). Positive = owed money, negative = owes money. Those balances are fed to a greedy pairing algorithm in [`src/lib/settlement.ts`](./src/lib/settlement.ts) that walks creditors and debtors and produces transfers — provably never more than `k − 1` transfers for `k` participants. All arithmetic runs in integer cents to avoid floating-point drift. Tests live in [`src/lib/settlement.test.ts`](./src/lib/settlement.test.ts).

## License

MIT © Jesse Thibodeau
