# The P & S Traveler Group

_Travel · Hotels · Local Services_ — "Connecting Travel, Hospitality & Local Services in Vrindavan".

Mobile-first travel and local-services marketplace: hotels, cabs, bike/rickshaw/car pick & drop, 24×7 food and essentials delivery, medicine delivery assistance, tour packages, flight/train/bus enquiries, and B2B services for hotels and local businesses.

**Stack:** Next.js 15 (App Router, React 19, TypeScript strict) · Tailwind CSS v4 + shadcn/ui · next-intl (English + Hindi) · Supabase (Postgres, Auth, RLS) · Razorpay · Vercel.

## Quick start

```bash
pnpm install
cp .env.example .env.local   # add Supabase URL + keys
pnpm dev
```

| Command                                              | What it does                                              |
| ---------------------------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                                           | dev server                                                |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | static checks                                             |
| `pnpm test`                                          | unit tests + database tests (migrations run in PGlite)    |
| `pnpm build && pnpm test:e2e`                        | production build + Playwright smoke tests                 |
| `pnpm rbac:generate`                                 | regenerate the RBAC seed migration from `lib/permissions` |
| `pnpm admin:create <email>`                          | create/promote the first super admin                      |

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [Decisions](docs/DECISIONS.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Changelog](docs/CHANGELOG.md)

## Build plan

Built phase by phase (1 Foundation → 11 Hardening). Phase 1 is done: theme, layout, i18n, Supabase clients, auth, profiles, RBAC + RLS, audit log, admin/vendor/driver shells.
