
## Roadmap (accepted architecture)
- **Phase 1 — Directory & trust (in progress):** verified profiles, JITO-wide search
  (Meilisearch), profile-as-website with verified domain linking, NFC cards + QR,
  chapter admin + **super-admin console** + **append-only audit log**.
- **Phase 2 — Sustain:** owned native ad system (sponsors/campaigns), analytics.
- **Phase 3 — Marketplace:** product catalog, orders, split/escrow payments
  (Razorpay Route / PayU), fulfilment status to the door, notifications.

## New in this build
- `audit/` — append-only `AuditLog` + global interceptor (every mutating admin
  request is recorded) + leadership-gated `GET /api/admin/audit`.
- `admin/` — `GET /api/admin/summary`, the cross-ecosystem overview the
  super-admin console runs on.
- Member **verify/unverify** (`PATCH /members/:id/verify`) and **offboard** now
  write human-readable audit entries.
- Schema scaffolds for the accepted roadmap: verified domain linking on Member,
  `Sponsor`/`AdCampaign`, `Product`/`Order` with split-payment fields.

## Go-live & operations docs
- `docs/GO-LIVE.md` — free-tier deploy (Neon + Render + Vercel), 3 environments, CI/CD, free email, temporary URLs.
- `docs/BULK-ONBOARDING.md` — import members from Excel (`npm run import:members`).
- `docs/NFC-ACTIVATION.md` — write/activate NFC cards.
- `docs/MOBILE.md` — install as a PWA (no app store); optional Android APK.
- `docs/GCP-DEPLOY.md` — deploy on Google Cloud free tier (Docker + auto-HTTPS), CI/CD, pay-later path.
