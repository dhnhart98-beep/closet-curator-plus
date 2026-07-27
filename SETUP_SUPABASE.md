# Supabase setup for Closet Curator+

Use an account and email address that you control. Codex does not need your
database password and you should not paste it into chat or commit it to GitHub.

## 1. Create the project

1. Sign in at <https://supabase.com/dashboard>.
2. Select **New project**.
3. Choose your organization.
4. Name the project `Closet Curator`.
5. Generate and save a strong database password in a password manager.
6. Choose the region closest to you.
7. Create the project and wait until provisioning finishes.

The database password is account-owned and secret. It is not used by the
browser app.

## 2. Create tables, RLS, and private storage

1. In the project dashboard, open **SQL Editor**.
2. Select **New query**.
3. Copy the complete contents of
   `supabase/migrations/202607270001_initial_schema.sql`.
4. Paste it into the editor and select **Run** once.

This creates:

- `profiles`
- `closet_items`
- `outfits`
- `outfit_items`
- `planner_entries`
- `shopping_list_items`
- private `clothing-photos` storage bucket
- ownership policies for select, insert, update, and delete
- per-user photo-folder policies
- realtime publication for synced tables

Do not disable RLS.

## 3. Configure authentication URLs

In **Authentication → URL Configuration** set:

- Site URL: `https://dhnhart98-beep.github.io/closet-curator-plus/`
- Redirect URL: `https://dhnhart98-beep.github.io/closet-curator-plus/**`

Keep email/password authentication enabled. During testing, keeping email
confirmation enabled is safer and mirrors production behavior.

For password-reset testing, verify the reset email returns to the GitHub Pages
address.

## 4. Connect the public browser app

1. Open **Project Settings → API** (or **Connect** in newer dashboards).
2. Copy the **Project URL**.
3. Copy the public **anon** or **publishable** key.
4. Open `config.js`.
5. Replace only the two placeholder values.

Example:

```js
window.CLOSET_CURATOR_CONFIG = {
  supabaseUrl: "https://abcdefgh.supabase.co",
  supabaseAnonKey: "your-public-anon-or-publishable-key"
};
```

The anon/publishable key is designed for client applications. Never substitute
the service-role key.

## 5. Publish

Commit all files except real secrets. GitHub Pages will redeploy from `main`.
Open the live URL in Safari and refresh once. If an older Home Screen version is
cached, remove it from the Home Screen, open the website in Safari, refresh, and
add it again.

## 6. Prove user isolation

Create two disposable accounts, A and B, with email addresses you control.

Device test:

1. Sign in as A on the iPad.
2. Add an item named `Private test item A` with a photo.
3. Sign out.
4. In a private Safari tab or another browser, sign in as B.
5. Confirm B sees an empty closet and cannot see A's photo.
6. Add `Private test item B`.
7. Sign out and sign back in as A.
8. Confirm A sees only A's item.

SQL policy test:

1. Copy `supabase/tests/rls_isolation_test.sql` into SQL Editor.
2. Run the complete script.
3. A successful run ends with `ROLLBACK` and no RLS failure exception.

The test creates two disposable users inside a transaction. It does not send
email and leaves no users or wardrobe records behind.

Delete the disposable accounts after testing.

## 7. Test cross-device syncing

1. Open the live site on the iPad and on a second device.
2. Sign in to both with the same confirmed account.
3. Add a clothing item on the iPad.
4. Within a few seconds, confirm it appears on the second device.
5. Favorite or edit it on the second device.
6. Confirm the update appears on the iPad.
7. Delete it on the iPad.
8. Confirm the item and photo disappear on the second device.

Both devices need internet access. The current version displays cached interface
assets offline, but cloud changes require a connection.

## Troubleshooting

- **Setup required:** `config.js` still contains placeholders.
- **Invalid login:** confirm the email before signing in.
- **Redirect rejected:** recheck the Site URL and wildcard Redirect URL.
- **Photo upload denied:** confirm the migration ran and the user is signed in.
- **Items do not update automatically:** check that the migration added the five
  tables to `supabase_realtime`; manual refresh should still load current data.
- **One user sees another user's data:** stop using the app immediately, keep RLS
  enabled, and rerun/audit the policies before entering real wardrobe data.
