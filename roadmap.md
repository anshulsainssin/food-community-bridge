# Roadmap

## Done
- [x] 24h auto-expiry for donations: claim guard, hourly pg_cron expiry job, and derived "Expired" badge/disabled claim across donations/index/details/pickup pages
- [x] "Use my location" button: real geolocation with permission/unavailable/timeout handling; nearby donations and NGOs sort/filter by real coordinates
- [x] End-to-end core flow verified with real data: donor creates donation -> NGO claims -> status advances Claimed -> Pickup in Progress -> Picked Up -> Completed
- [x] RLS/permissions review across profiles, donations, claims, pickup_events, notifications: closed a contact_info exposure (was readable via `select("*")` on donations to any signed-in user, bypassing `donation_parties()`) and a status-transition bypass (`advance_donation_status()` now enforces the single-step pickup state machine instead of only checking the target status)

## Queued
- [ ] None currently tracked
