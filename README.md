# Closet Curator+

An iPad-friendly progressive web app with Supabase email/password accounts,
private cloud wardrobe data, private photo storage, and cross-device syncing.

## Architecture

- Static HTML/CSS/JavaScript PWA hosted by GitHub Pages
- Supabase Auth for email/password accounts
- Supabase Postgres for closet items, outfits, plans, and shopping lists
- Private Supabase Storage bucket for clothing photos
- Row Level Security (RLS) on every user-owned table
- Realtime refresh when another signed-in device changes data

The original local-only prototype is preserved unchanged in `legacy-prototype/`.
It is not loaded by the cloud app.

## Setup

Follow [SETUP_SUPABASE.md](SETUP_SUPABASE.md). In summary:

1. Create a Supabase project in your own account.
2. Run `supabase/migrations/202607270001_initial_schema.sql`.
3. Configure the GitHub Pages URL in Supabase Auth URL settings.
4. Copy the project's public URL and anon/publishable key into `config.js`.
5. Commit and publish the updated files.

Never place a database password, service-role key, personal access token, or any
other secret in this repository. The browser-facing anon/publishable key is
intended to be public; RLS and storage policies enforce access.

## Current cloud features

- Sign up, email confirmation, sign in, sign out, and password-reset email
- Add, view, edit, favorite, and delete closet items
- Upload and privately retrieve clothing photos
- Search and filter
- Build and save outfits
- Weekly planning
- Shopping list
- Cost-per-wear analytics
- Live cross-device refresh
- JSON export

The cloud app intentionally does not auto-import old local backups. Keep any
existing backup file until a validated migration flow is added.

## Local preview

Serve this folder through a local web server. Opening `index.html` as a raw file
can prevent authentication redirects and service workers from working.

## Security verification

After creating two disposable accounts, follow
`supabase/tests/rls_isolation_test.sql` and the device test in
`SETUP_SUPABASE.md`. The SQL test uses a transaction and rolls its test changes
back.
