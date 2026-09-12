# Recreate Food Waste Connect — fully real data, no placeholders

Rebuild the app from the GitHub source exactly as it looks today (same pages, same layout, same styling), put a real Lovable Cloud backend behind it with sign-in, and make every number, name, phone, address, date and status come from the database for the signed-in person.

## Pages (unchanged from the original)

- `/` Overview — welcome, four stat tiles, recent donations, quick actions, "Share surplus food" form
- `/auth` Sign in / create account (email + password, and Google)
- `/donations` Find food — filters, distance filter, donation cards, claim button
- `/pickup` Pickup tracking — status timeline and pickup details
- `/impact` Community impact — stat tiles and progress bars
- `/profile` Community profile — view and edit details

Same navigation shell (sidebar, mobile menu, bottom bar, notification bell), same fonts, colours and spacing.

## What gets stored

- **People** — name, role, organization, phone, email, location label, saved coordinates
- **Donations** — food type, dietary type, quantity, prepared time, pickup deadline, contact, notes, pickup address and coordinates, current status
- **Claims** — who claimed a donation and when
- **Pickup timeline** — a row each time a donation moves through Available → Claimed → Pickup in Progress → Picked Up → Completed, with who did it and when
- **Notifications** — per person, e.g. "Your donation was claimed", with read/unread

Everyone can see open donations; people can only edit their own profile, their own donations, and claims they made.

## Removing every made-up value

Audit result — these are hardcoded in the original and will all be replaced:

| Where | Fake today | Becomes |
| --- | --- | --- |
| Overview tiles | 2,480 / 1,860 / 07 / 128 | Counted from the signed-in person's donations |
| Overview intro | "redistributed 214 meals this month" | Real count, or a neutral line when there is none |
| Overview eyebrow | "September 04" | Today's date |
| Impact tiles | 2,480 / 1,860 / 142 / 128 | Counted network-wide from completed donations |
| Impact progress bars | 82% / 94% / 88% with "410 of 500 kg" | Real ratios from real counts; hidden with an empty state at zero |
| Sidebar | "1,860 people" | Real number fed, "0 people" when empty |
| Pickup page | "FWC-2048", "Vegetable biryani & dal", "Maya Sharma · Maya's Kitchen", "+91 98765 43210", "Seva Community Trust · Arjun Mehta", "Today, 1:30 PM", "40 sealed meal portions", "Prepared today at 8:30 AM" | The actual donation being tracked, its donor's real name/phone, the claimer's real name, real times |
| Pickup timeline | Local counter that resets on refresh | Saved stages, with buttons that advance the real status |
| Donations page | Claim only lived in the browser | Real claim written to the database, status updated, donor notified |
| Notification bell | Always-on dot | Real unread count, real list, empty state |
| Form placeholders | "+91 98765 43210", "12 Garden Avenue, Central Market", "40" | Neutral hint text, no sample values |

Empty states everywhere: "No donations yet", "No notifications", "0 kg saved", "No pickup in progress".

## One honest-numbers decision

The donation form asks for "Quantity / people served" — a number of people, not kilograms. So the "Food saved (kg)" tiles have no real kilogram figure behind them. Rather than invent a conversion, the donation form gains one small optional field, **Weight (kg)**, next to quantity. Food-saved tiles then show the real summed weight, and "0 kg" until someone records one. This is the only addition to the original layout; everything else stays as-is.

## Technical notes

- TanStack Start + Lovable Cloud (Supabase). Tables: `profiles`, `donations`, `claims`, `pickup_events`, `notifications`, all with RLS and explicit grants.
- Status transitions and notification writes go through a database function so a receiver can advance a donation they claimed without owning the row.
- Donor/claimer names on the pickup page come from a narrow view exposing only name, organization and contact for donations you are party to — no broad profile read access.
- Stats are computed with SQL aggregates, not client-side over fetched rows.
- Protected pages sit behind the auth gate; `/auth` stays public.
