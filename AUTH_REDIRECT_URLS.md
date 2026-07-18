# BudgetKazPei Auth Redirect URLs

Supabase Auth must allow these redirect URLs:

- Local dev used by current tests: `http://localhost:5175/auth/callback`
- Local dev on loopback IP: `http://127.0.0.1:5196/auth/callback`
- Production: `https://budgetkazpei.vercel.app/auth/callback`

BudgetKazPei builds the Google OAuth redirect URL from the current browser origin:

`redirectTo: ${window.location.origin}/auth/callback`

If one of the local URLs above is missing from Supabase Dashboard > Authentication > URL Configuration > Redirect URLs, Supabase can ignore the requested local redirect and fall back to the production Site URL.

This file documents the required remote configuration. It does not modify the Supabase dashboard.

Capacitor/mobile redirect URLs still need a dedicated validation pass before adding a custom deeplink.
