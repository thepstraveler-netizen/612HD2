# Changelog

## Phase 1 · Foundation

### Added

- Next.js 15 App Router project (React 19, TypeScript strict, Tailwind v4, pnpm).
- P&S design tokens from the poster (navy/blue/sky + 9 service accents) with dark mode; Plus Jakarta Sans, Noto Sans Devanagari and Dancing Script fonts.
- shadcn/ui primitives and brand components: Logo (P&S circle mark), SectionTitle (brush ribbon), ServiceCard, EmptyState, temple-skyline and peacock-feather motifs.
- English + Hindi via next-intl (`/` and `/hi`), language switcher, full Hindi translation of every UI string.
- Sticky header with the 10 nav tabs, mobile drawer, theme toggle, user menu; footer with "Together for a Better Vrindavan".
- Home (hero, four pillars, about, 14-service grid, partner CTA), service pages for all 14 services, Partner With Us page, 404 and forbidden pages.
- Supabase browser, server and service-role clients via `@supabase/ssr`; middleware session refresh + route protection for `/account`, `/admin`, `/vendor`, `/driver`.
- Auth: Google OAuth, email + password, email magic link, sign-up with confirmation, forgot/reset password, sign-out.
- Migrations: extensions and helpers, RBAC tables and `has_permission()`, profiles with signup trigger, generated RBAC seed, audit log with triggers, super-admin bootstrap function.
- Server guards `requireUser`, `requirePermission`, `assertPermission`.
- Admin shell with collapsible sidebar for all 18 modules (filtered by permission), dashboard, per-module placeholders, audit log viewer.
- Guarded vendor and driver portal shells.
- Tests: 44 unit + database tests (RLS, escalation, audit, i18n parity, routing, schemas) and 18 Playwright smoke tests; GitHub Actions CI.
- Docs: ARCHITECTURE, DECISIONS, DEPLOYMENT; `.env.example`; Husky + lint-staged.
