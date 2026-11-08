# TODO

## Next up (as of 6 Nov 2026)

Sign-in, Pro sync (#71) and the Android Auto session work (#72) are on main.
Every build now shows sign-in, so the release waits on steps 1-4; the
details are in the sections below.

1. [x] **Legal pages live**: `gh-pages` pushed (814424c); privacy, terms and
       delete-account return 200 in both languages (checked 7 Nov 2026).
2. [x] **Play Console**: Data safety redone, delete-account URL added, App
       access filled in, content rating re-run and changes sent for review
       (owner, 7 Nov 2026).
3. [ ] **RevenueCat**: confirm "Keep with original App User ID" is saved;
       create the reviewer Google account with lifetime promotional Pro.
4. [x] **Google Cloud**: Android OAuth clients for the Play App Signing and
       upload-key SHA-1s exist (owner confirmed 7 Nov 2026).
5. [ ] **Release**: bump `versionCode`, add `RELEASE-NOTES.md` (sign-in, Pro
       sync, the new Account page, Android Auto keeping its session), then
       `npm run android:build` with Android Studio closed and check
       `android/app/src/main/assets/public/index.html` exists before uploading.
6. [ ] **Supabase Free to Pro** before real subscribers' data builds up (Free
       has no backups). Deferred by the owner on 7 Nov 2026; still needed
       before subscribers' synced data grows.
7. [ ] **Device checks**: sign-in and sync checks passed (7 Nov 2026). Still
       to do, in a car: close and reopen Rafeeq while it plays (it should
       continue the same verse), and pick a surah inside a reciter's folder
       (it should play that reciter).
8. [ ] **Later**: turn on the Pro gate (`REACT_APP_PRO_GATE=on`, then the
       broker's `REQUIRE_PRO="true"` and deploy). Apple sign-in waits for the
       iOS app (see "Later").

## Rafeeq Pro launch (RevenueCat)

Code is done and merged; Test Store purchases, restore and the Arabic paywall
are verified on a debug build. What's left is store setup and launch, in this
order. Full detail in `PLAY-CONSOLE-PREP.md` §9.

- [x] **Google Play products.** In Play Console → Monetize → Subscriptions,
      create `monthly` and `yearly` with their real prices and base plans.
      Done 29 Oct 2026: subscription `rafeeq_pro`, base plans `monthly` and
      `yearly`, active; real-time developer notifications connected.
- [x] **Link Play to RevenueCat.** Add the Play Store app in RevenueCat,
      upload Google's service-account credentials, attach the Play products
      to the entitlement `com_rafeeq_quranquiz_pro`, and put them in the
      `default` offering's Monthly and Annual packages. Add your Google
      account as a license tester in Play Console.
- [x] **Keys.** Put the `goog_…` public key in `.env.production` as
      `REACT_APP_REVENUECAT_ANDROID_KEY`, and **delete the `test_` line from
      `.env.local`** — `.env.local` overrides `.env.production`, and the SDK
      crashes release builds that carry a Test Store key (the app refuses it,
      so RevenueCat would simply be off).
- [x] **Worker.** Copy the RevenueCat secret key (`sk_…`), run
      `npx wrangler secret put REVENUECAT_SECRET_KEY`, and deploy with
      `REQUIRE_PRO` still `"false"`.
- [x] **Store forms.** Done 7 Nov 2026. Before the first build carrying the `goog_` key:
      content rating (digital purchases = Yes) and Data safety (purchase
      history). The hosted privacy policy and terms already name RevenueCat
      and cover subscriptions (updated 24 Oct 2026).
- [ ] **Real-purchase test.** Closed-testing build with the `goog_` key and
      the license-tester account: buy, renew, expire, reinstall + Restore,
      Customer Center.
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

- [x] **Supabase project.** One project for production (owner's call,
      6 Nov 2026): ref `fmoqvreblkfomfhpghzg`, London (eu-west-2), ES256 keys,
      email sign-in off. All three migrations pushed with the CLI and the
      sync_items self-check passed. Its URL is in `.env.production`,
      `.env.local` and both `wrangler.toml` environments.
- [x] **Google.** Web client and debug sign-in work (6 Nov 2026); the Android
      clients for the Play App Signing and upload-key SHA-1s exist (owner
      confirmed 7 Nov 2026).
- [x] **Edge Functions.** Secrets `SUPABASE_SERVICE_ROLE_KEY` (Supabase
      provides it), `REVENUECAT_SECRET_KEY`, `ADMIN_DELETE_SECRET` (long random,
      at least 32 characters); deploy `delete-account` and `apple-token`.
- [x] **App env.** Supabase URL, publishable key and Google web client id are
      in `.env.production` (and the same values in `.env.local`, which
      overrides it). Every release built now shows sign-in: ship only after
      the paperwork is live.
- [ ] **RevenueCat dashboard.** Transfer behaviour so a purchase stays with the
      account that bought it ("Keep with original App User ID", or the
      dashboard's current name for it; verify). Create a reviewer test Google
      account and grant it promotional Pro.
- [x] **`npx cap sync`**: `@capacitor/browser` and
      `@capgo/capacitor-social-login` are registered in the Android project
      (committed 6 Nov 2026).
- [x] **Legal pages.** Pushed and live (7 Nov 2026). Was on the local `gh-pages` branch; the region
      is filled in as London, United Kingdom. Push it after the owner
      confirmation below, then confirm `delete-account.html` (+ `-ar`),
      `privacy.html` and `terms.html` load.
- [x] **Play Console.** Done 7 Nov 2026. Redo Data safety (Name, Email, User IDs for account
      management; Purchase history; deletion = yes; delete-account URL
      `<LEGAL_BASE_URL>/delete-account.html`), App access with the reviewer
      account, and re-run the content rating if not done for Pro.
- [ ] **Supabase Free to Pro** before real subscribers' data accumulates (Free
      has no backups). This now matters most for Pro sync: `sync_items` holds
      subscribers' notes, bookmarks, progress and settings.
- [x] **Device check: sync, two phones.** Passed (owner, 7 Nov 2026). Same Pro account on both. Edit the
      same note offline on each, reconnect, sync, and confirm both phones end
      with one copy holding the later edit.
- [x] **Device check: backup import on a synced phone.** Passed (owner, 7 Nov 2026). Import a backup and
      confirm nothing disappears (locally or on the other phone); the import
      only adds and overwrites.
- [x] **Release gate: run the sync_items SQL self-check.** Passed 6 Nov 2026
      on the production project.
- [x] **Release gate: fresh install on an Android device.** Passed (owner, 7 Nov 2026). The strict Hifz read
      and write path has never run on a device. Sign in on a fresh install with a
      Pro account that has a Hifz plan: Account must show synced, not an error, and
      the plan, best and latest records and read pages must arrive rather than
      being skipped.
- [x] **Data safety for synced data.** Done 7 Nov 2026. In the same redo: App activity → user
      content (notes) and app interactions (Hifz progress, tracker) now
      collected for Pro subscribers; app functionality; encrypted in transit;
      deletable (`PLAY-CONSOLE-PREP.md` §2).
- [x] **Device check: offline launch.** Passed (owner, 7 Nov 2026). Sign in, wait until the access token
      has expired (over an hour), then launch offline: the app must show the
      account as signed in and keep Pro.
- [ ] **Broker against prod.** Run `token-broker/verify-deploy.sh` with a
      `PRO_TOKEN` from the prod project once the Worker's `SUPABASE_URL` is
      set to the prod URL exactly as it appears in that token's `iss` (`iss`
      is `<SUPABASE_URL>/auth/v1`: same scheme and host, so not a custom
      domain if the token says `<ref>.supabase.co`); any mismatch refuses
      every account.
- [x] **Owner:** (done; gh-pages pushed 7 Nov 2026) confirm the 30-day deletion window, the email identity check and the terms §5 closure clause before pushing gh-pages.
- [ ] **Support runbook.** Email deletion requests:
      `SUPABASE_URL=... ADMIN_DELETE_SECRET=... scripts/delete-account.sh <user-id | email>`.

## Later

- [ ] **Apple sign-in, with the iOS app** (not needed until then). Services ID
      + key; Supabase Apple provider with the Services ID and the iOS bundle id
      among its client ids; `rafeeq://auth/callback` in Supabase's redirect
      allow-list; Edge Function secrets `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
      `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`. Known limit: Apple accounts
      created through the Android web flow have no stored Apple token, so
      deletion can't revoke Apple's grant for them.

- [ ] **Pro sync follow-ups (none block launch).** Small or rare cases left from
      the Nov 2026 reviews:
      - Exclude the two native reminder flags from settings sync; phones with
        different reminders overwrite each other when Settings opens.
      - A corrupt Hifz archive map never recovers on that device: treat it as
        empty and marked, since the cloud holds the archives.
      - Items that lose their id (numeric ids, `[null, null]`) or a plan holding
        JSON `null` still read as deletes. No writer I read produces these.
      - Settings or Hifz best corrupted, then defaults written: the defaults
        replace the cloud copy once on all devices.
      - Android: file read error, no localStorage mirror, Pro lapsed, new plan:
        the old cloud plan is lost with no archive.
      - A store corrupted twice within one run, or with storage too full to save
        the broken-store mark, can still send deletes.
      - A corrupted best, latest or reading record stops the Hifz plan refreshing
        on that device.
      - A settings toggle is lost if a sync lands within its 250 ms save delay.
      - A delete and an edit within one run's pull-to-push window can lose the
        edit; a newer push can overwrite a row stored after our pull.
      - After an app update, rows the old build couldn't read aren't re-fetched
        until they change: reset the cursor on a schema change.
      - `diffAgainstSnapshot` in `local-changes.ts` is dead code.
- [ ] **Ionic version mismatch.** `@ionic/react` is on 7.8.6 (`^7.0.0`) but
      `@ionic/react-router` is on 8.8.19 (`^8.7.18`). Mixed majors work today
      but aren't a supported pairing. Align both on Ionic 8 (`@ionic/react`
      8.x — read Ionic's 7→8 migration guide first) and re-test navigation,
      Back handling, overlays and the bottom nav. Ionic 9 is out too, but
      that is a separate, later upgrade. Found in the Oct 2026 dependency audit.

- [ ] **Major upgrades.** React 19, React Router 7, Ionic 9, TypeScript 7 and
      `@quranjs/api` 3 are out. Each is a breaking migration of its own; do
      them one at a time, after the Ionic 8 alignment above.

- [ ] **Regenerate the knowledge graph** (`/understand`). The current graph
      is from June 2026 and predates recite mode, Rafeeq Pro, Soniox, the
      tracker and prayer alarms, and still lists Electron, so CLAUDE.md's
      "graph first" rule points at stale code until it's rebuilt.
