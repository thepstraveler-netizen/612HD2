# Deployment

From zero to a running Phase 1 site. Later phases add steps (storage buckets, Razorpay, cron); those are listed at the end so environments can be prepared once.

## 0. Prerequisites

- Node 22 and pnpm 10 (`corepack enable`)
- Supabase CLI (`brew install supabase/tap/supabase` or `npx supabase`)
- A Supabase account, a Vercel account, and a Google Cloud project for OAuth

## 1. Run locally

```bash
pnpm install
cp .env.example .env.local     # fill in the Supabase values below
pnpm dev                       # http://localhost:3000 and http://localhost:3000/hi
```

The public pages render without Supabase; sign-in and the protected areas need it.

### Optional: local Supabase

```bash
supabase init        # once; keeps the existing supabase/migrations folder
supabase start       # prints a local URL, anon key and service-role key
supabase db reset    # applies every migration in supabase/migrations
```

Put the printed URL and keys into `.env.local`. Local emails land in Inbucket (the URL is printed by `supabase start`).

## 2. Create the Supabase project

1. Create a project (region: Mumbai `ap-south-1` for Indian users).
2. Settings → API: copy the Project URL, `anon` key and `service_role` key.
3. Link and push the schema:

   ```bash
   supabase link --project-ref <project-ref>
   supabase db push
   ```

4. Check Table Editor: `roles` has 7 rows, `permissions` has 41, `services` has 14.
5. Optional demo content (banners, testimonials, FAQs): run `supabase/seed.sql` in the SQL editor. Skip it in production if you'll add your own.

## 3. Configure Auth

Authentication → URL Configuration:

- **Site URL:** `https://<your-domain>`
- **Redirect URLs:** add
  - `http://localhost:3000/**`
  - `https://<your-domain>/**`
  - `https://*-<your-vercel-team>.vercel.app/**` (preview deployments)

Authentication → Providers:

- **Email:** enabled, "Confirm email" on.
- **Google:** in Google Cloud Console create an OAuth client (Web), add the authorised redirect URI shown by Supabase (`https://<project-ref>.supabase.co/auth/v1/callback`), then paste the client id and secret into Supabase.

Email templates work as-is (they use the `/auth/callback` PKCE flow). For production email delivery, set a custom SMTP provider (Resend) under Authentication → Emails.

## 4. Create the first super admin

```bash
pnpm admin:create owner@example.com "Owner Name"
```

This creates the user with a confirmed email (or promotes an existing one) and grants `super_admin`. Log in at `/login` with the email link or with Google using the same address, then open `/admin`.

## 5. Deploy to Vercel

1. Import the GitHub repo in Vercel (framework: Next.js; install `pnpm install`; build `pnpm build`).
2. Environment variables (Settings → Environment Variables):

   | Variable                        | Preview              | Production              |
   | ------------------------------- | -------------------- | ----------------------- |
   | `NEXT_PUBLIC_SITE_URL`          | preview URL or blank | `https://<your-domain>` |
   | `NEXT_PUBLIC_SUPABASE_URL`      | ✓                    | ✓                       |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓                    | ✓                       |
   | `SUPABASE_SERVICE_ROLE_KEY`     | ✓ (server only)      | ✓ (server only)         |

   Use a separate Supabase project for previews if you want test data isolated from production.

3. Deploy. Add the custom domain under Settings → Domains; Vercel issues the SSL certificate.

## 6. Phase 1 smoke test

- [ ] `/` shows the English home with 14 services; `/hi` shows Hindi; the language switcher keeps the current page.
- [ ] Sign up with email → confirmation email → lands on `/account` with the role "Customer".
- [ ] Log out, log in with Google, and with an email link.
- [ ] "Forgot password" email → `/account/update-password` → new password works.
- [ ] As a customer, `/admin` shows "You don't have access".
- [ ] As the super admin, `/admin` shows the sidebar with all 18 modules and the audit log, which lists the profile/role changes.
- [ ] Signed out, `/admin`, `/account`, `/vendor`, `/driver` redirect to `/login?next=…`.

## 7. Phase 2 smoke test

- [ ] `/services` lists the 14 services; `/services/car` shows highlights.
- [ ] As the super admin, Admin → CMS → Services: rename a service, save, and the home page shows the new name on refresh.
- [ ] Upload a hero image for a service; it appears on the service page.
- [ ] Admin → Offers: create a banner with a coupon code and today's dates; it appears in the home offers carousel.
- [ ] Admin → Settings: change the WhatsApp number; the footer link updates.
- [ ] Admin → Audit log lists each of those changes.
- [ ] Storage → buckets shows `media` (public), `documents` and `prescriptions` (private).

## Later phases (prepare when you reach them)

- **Phase 4:** Razorpay keys (`NEXT_PUBLIC_RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`), webhook at `https://<domain>/api/webhooks/razorpay` with `RAZORPAY_WEBHOOK_SECRET`; Vercel Cron for inventory-lock expiry protected by `CRON_SECRET`; Resend/MSG91/WhatsApp keys.
- **Phase 5–6:** Google Maps key (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`), restricted to your domains.
- **Phase 11:** Sentry DSN, Upstash Redis, Cloudflare Turnstile keys.
