# Food Waste Connect

A community food-donation app: donors publish surplus food, NGOs and volunteers claim it, and the
pickup is tracked from claim to completion (with one-time QR verification at handover).

Built with TanStack Start (React) on a Supabase backend (auth, Postgres with row-level security,
realtime). Database changes live in `supabase/migrations`.

## Development

You need Node.js (or Bun).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

Production build for Vercel: `NITRO_PRESET=vercel npm run build`.

## Removing test donations

`supabase/scripts/delete-test-donations.sql` deletes donations made by test accounts only. Run it
by hand in the Supabase SQL editor; it is not a migration and never runs automatically.
