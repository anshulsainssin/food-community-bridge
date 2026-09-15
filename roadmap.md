# Roadmap

## In progress
- [ ] 24h auto-expiry for donations: claim guard + expiry function applied; scheduled hourly check pending (cron schema missing — retry with pg_cron extension enabled, else fallback)
- [ ] UI: derived "Expired" badge + disabled claim on donations/index/details/pickup pages

## Queued
- [ ] End-to-end test of core flow with real data: donor creates donation → NGO claims → status advances to Completed
- [ ] Verify RLS/policies across profiles, donations, claims, pickup_events, notifications; fix only real blockers
- [ ] Fix "Use my location" button: proper geolocation error handling (denied/unavailable/timeout) with user feedback; sort/load nearby by coords (no UI changes)
