# Roadmap

## Done
- [x] 24h auto-expiry: claim guard, hourly expire job (persisted "Expired", rows kept in history), stats exclude expired, UI badges/disabled claim
- [x] "Use my location" button: distinct denied/unavailable/timeout feedback; verified in browser (denied + granted)
- [x] End-to-end flow test: donor create → receiver claim → advance to Completed (status Completed, 1 claim, 5 timeline events, 4 notifications) — passed, rehearsal data removed
- [x] RLS/permissions verified: receiver cannot edit/delete donor's donation, cannot read others' profiles/notifications, cannot insert claims directly

## Open
- [ ] Browser-based signed-in UI test — blocked: session minting doesn't reach this sandbox; needs user sign-in in the preview
- [x] Pincode search flies map to location; fallback message when no listings (done)
