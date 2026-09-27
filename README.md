# Food Connect Now

Recreate the "Food Waste Connect" app from the public GitHub repository https://github.com/anshulsainssin/food-connect-gleam (live site: https://food-connect-gleam.lovable.app). Fetch and inspect the repo source and replicate it faithfully: keep all existing routes, pages, components, and the UI/design exactly as they are.

Use Lovable Cloud (Supabase) as the real backend with authentication. Then audit the entire codebase and remove ALL hardcoded, fake, demo, sample, and placeholder data — no fake fallback data anywhere. Every page and component must read/write real database data for the logged-in user: user profile/name/contact, donor details, NGO/volunteer details, food type and quantity, donation date/time, food expiry/pickup time, pickup location, donation status, claim information, pickup tracking timeline, notifications, dashboard statistics, impact statistics, donation history, and pickup history.

Where no real data exists, show proper empty states (e.g. "No donations yet", "No notifications", "0 kg saved") instead of sample values. Also replace any hardcoded phone numbers, names, addresses, quantities, dates, statistics, and status values anywhere in the project with real database-driven values. Do not invent fake data to make the UI look populated. Keep routes, UI, and design unchanged.

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
