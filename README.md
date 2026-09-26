# Food Waste Connect

A community food-waste reduction platform: people sponsor meals, community kitchens track
surplus food stock, and distribution points are shown live on a map. English and Hindi.

## Architecture

- **App:** TanStack Start (React, file-based routes in `src/routes`), server functions in
  `src/lib/*.functions.ts`.
- **Database:** MongoDB, accessed only on the server (`src/integrations/mongodb/db.server.ts`).
- **Sign-in:** Google OAuth (`/api/auth/google` → `/api/auth/callback/google`) with a signed,
  httpOnly session cookie (`src/lib/auth`).

| Page | What it does |
| --- | --- |
| `/` | Live totals: meals cooked, people served, active kitchens, meals sponsored |
| `/sponsor` | Record a meal sponsorship and see your impact certificates |
| `/inventory` | Kitchen stock with low-stock / re-order alerts (admins can edit) |
| `/distribution` | Map of distribution points, delivery logging, partner registration |
| `/impact`, `/about`, `/contact` | Impact totals, mission, contact form and volunteer sign-up |
| `/profile` | Your contact details and location |
| `/admin` | Sponsorships, partner registrations, users, messages, volunteers (admins only) |

## Setup

Copy `.env.example` to `.env` and fill in `MONGODB_URI`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` and `ADMIN_EMAILS` (set the same variables on Vercel),
then `npm i && npm run dev`.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1b64f5fa-f3ff-4fc1-934e-5c8c357c6726).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
