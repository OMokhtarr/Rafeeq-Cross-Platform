# TODO

## Next up (as of 10 Nov 2026)

Sign-in, Pro sync, the Android Auto session fixes and Feelings shipped in
versionCode 19 (1.1.0), built and uploaded. The device checks, including the
car ones, have passed. The details are in the sections below.

1. [ ] **Supabase Free to Pro** before real subscribers' data builds up (Free
       has no backups). Deferred by the owner on 7 Nov 2026; still needed
       before subscribers' synced data grows.
2. [ ] **Later**: turn on the Pro gate (`REACT_APP_PRO_GATE=on`, then the
       broker's `REQUIRE_PRO="true"` and deploy). Apple sign-in and the rest
       of the iPhone work are in `APPLE-TODO.md`.

## Rafeeq Pro launch (RevenueCat)

Code is done and merged; Play products, the RevenueCat link, keys, Worker
secret and store forms are all set up. What's left is testing and launch, in
this order. Full detail in `PLAY-CONSOLE-PREP.md` §9.

- [ ] **Real-purchase test.** Closed-testing build with the `goog_` key and
      the license-tester account: buy, renew, expire, reinstall + Restore,
      Customer Center.
- [ ] **Retention device test.** Play offers and the Customer Center mapping
      are done (14 Nov 2026). On a device: a new buyer's paywall shows the
      full price and the free trial on Yearly and Monthly (no save offer
      leaking), and Cancel → "Too expensive" shows the save offer and
      accepting it completes. The offer's eligibility is first seen > 20 days
      AND first purchase > 30 days — set both to 0 for the test, then restore.
      Refund runbook: `PLAY-CONSOLE-PREP.md` §9 "Retention".
- [ ] **Launch.** Set `REACT_APP_PRO_GATE=on` in `.env.production` (leave it
      out of `.env.local`) and release; then set `REQUIRE_PRO = "true"` in
      `token-broker/wrangler.toml` and deploy; then run
      `PRO_TOKEN=<access token of a signed-in Pro account> bash token-broker/verify-deploy.sh`
      — every check must pass. (`PRO_TOKEN` is a fresh Supabase access
      token, not a user id.)

## Accounts launch (Supabase sign-in, owner setup)

Sign-in is on in every build that has the Supabase URL and key (the old
`REACT_APP_ACCOUNTS` switch is gone). Pro lives on the account, so this comes before the Pro launch above goes live. Full detail,
the release order and the store paperwork are in `PLAY-CONSOLE-PREP.md` §2,
§4 and §9.

- [ ] **Supabase Free to Pro** before real subscribers' data accumulates (Free
      has no backups). This now matters most for Pro sync: `sync_items` holds
      subscribers' notes, bookmarks, progress and settings.
- [ ] **Support runbook.** Email deletion requests:
      `SUPABASE_URL=... ADMIN_DELETE_SECRET=... scripts/delete-account.sh <user-id | email>`.

## Later

- [ ] **Ionic 8 device check.** `@ionic/react` and `@ionic/react-router` are on
      8.8.19 (was 7.8.6 + 8.8.19, two Ionic copies), TypeScript on 5.9, and the
      WebView floor rose from 79 to 89 (Ionic 8's minimum: `browserslist` and
      `minWebViewVersion`). Tests and `tsc` pass; on a phone, check: page
      transitions, hardware Back and the double-back exit toast, edge
      swipe-back (blocked on the root tabs), toasts (top and exit), sheets
      closing on Back, the bottom nav, the onboarding tours' spotlight timing,
      and the Hifz page.
