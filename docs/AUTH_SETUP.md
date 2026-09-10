# Google Login & cloud progress (Vercel)

Auth and progress sync stay on the free Hobby stack: **Auth.js + Google OAuth** on Vercel, **Supabase Postgres** for per-user progress JSON. No Firebase.

## What you get

- `/account` — sign in / out with Google, see local progress summary
- Home greeting + avatar from the Google session
- Progress unified in one `localStorage` key (`nanu-horen-progress`)
- When signed in, progress merges with and syncs to Supabase so devices stay in sync

Anonymous practice still works offline; login merges device progress into the cloud copy.

Login stays on Auth.js (not Supabase Auth). Supabase is only the database.

## 1. Google OAuth client

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth client ID (Web application)
3. Authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://YOUR_PRODUCTION_DOMAIN`
4. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://YOUR_PRODUCTION_DOMAIN/api/auth/callback/google`
5. Copy Client ID and Client Secret

## 2. Supabase via Vercel (recommended)

1. In your Vercel project: **Storage** (or Marketplace) → add **Supabase**
2. Connect it to this project so Vercel injects env vars (usually includes some of):
   - `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
   - often also `POSTGRES_URL` / anon key — we only need URL + service/secret key
3. Open the linked Supabase project → **SQL Editor** → run `supabase/user_progress.sql`
4. For local dev, pull Vercel env into `.env.local`:

```bash
vercel link   # once, if not linked
vercel env pull .env.local
```

Then add Auth.js vars if they are not already present (`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`).

Without the progress table / service key, Google login still works; progress stays on-device only.

## 3. Env vars the app reads

| Purpose | Names accepted |
|--------|----------------|
| Project URL | `SUPABASE_URL` **or** `NEXT_PUBLIC_SUPABASE_URL` |
| Server DB access | `SUPABASE_SERVICE_ROLE_KEY` **or** `SUPABASE_SECRET_KEY` |
| Google login | `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |

Never expose the service/secret key to the browser (no `NEXT_PUBLIC_` on that key).

## 4. Vercel env checklist

In **Settings → Environment Variables**, confirm Production (and Preview if needed) has Google + Supabase keys. Redeploy after changes.

You do **not** need `AUTH_URL` on Vercel; `trustHost` is enabled.

## 5. Smoke test

1. `npm run dev` → open `/account` → **Đăng nhập với Google**
2. Complete a clip in an interview session
3. Confirm home “continue learning” / streak update
4. Sign in on another browser/device and confirm merged progress
