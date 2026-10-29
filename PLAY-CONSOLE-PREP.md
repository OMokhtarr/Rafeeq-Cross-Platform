# Play Console prep — Rafeeq

Everything needed for the Play Store listing, derived from what the app actually
declares and does. Answers here are meant to be copied into the console verbatim.

App: **Rafeeq** · package `com.rafeeq.quranquiz` · versionCode 6 / versionName 1.1.0

> ⚠️ **The package name is `com.rafeeq.quranquiz` — note the trailing `z`.**
> The first Play Console entry was created as `com.rafeeq.quranqui` (one character
> short), which rejected every upload with "your bundle needs to have the package
> name com.rafeeq.quranqui". That message echoes what the console entry was
> registered with; it is not a statement about what the bundle should contain.
>
> A console entry's package name **cannot be changed, and cannot be reused even
> after deleting the app**. The fix was to create a new app entry with the correct
> name (done 11 Sep 2026); the old draft entry was never used for a test, so
> nothing was lost. When creating an entry, paste the package name and count the
> characters — 20, ending in `z`.
>
> versionCode is 4. It is not 1 because earlier codes were spent against the old
> entry before the mistake was found. The new app has its own history, so the
> starting number is cosmetic — versionCode only ever has to increase.

> ✅ **Credentials rotated** 13 Aug 2026 and verified working through the broker.
>
> ✅ **Token broker deployed and verified** 15 Aug 2026.
> `bash token-broker/verify-deploy.sh` passes: `/deepgram/token` is live and
> mints real Deepgram ASR grants (`asr:write` scope), not the Quran Foundation
> fallback token. Recite mode smoke-tested against this deployment and working.
>
> ✅ **QF 7-day caching rule closed** 22 Aug 2026. Content Sync is implemented and
> merged for tafsirs and recitations; the Quran script is covered by express
> written permission from Quran Foundation. See §5 and `docs/licensing-decisions.md`.

---

## 0. Status at a glance

Last updated 29 Oct 2026. Section numbers link to the detail below.

> **Accounts (sign-in with Google / Apple, Supabase) are built but ship dark**
> behind `REACT_APP_ACCOUNTS=on`. Everything in §1, §2, §4, §8 and §9 below
> that mentions accounts describes the build that goes out with that switch on.
> Until then the app still has no accounts. The owner setup list and the
> release order are in §9; the same list is in `TODO.md`.

### Outstanding

Ordered by category: work that changes the app first, then what we're waiting on
someone else for, then paperwork that can be filled in any time.

#### A. Needs work on the app — do these first

| # | Task | § | Blocking |
|---|---|---|---|
| ~~A1~~ | ~~**QF 7-day caching rule**~~ | 5 | ✅ **Done 22 Aug 2026** |
| ~~A2~~ | ~~**Postal address in `privacy.html`**~~ | 5 | ✅ **Done 11 Sep 2026** |
| ~~A3~~ | ~~**Address mirrored into `Account.tsx`**~~ (AR + EN in sync) | 5 | ✅ **Done 11 Sep 2026** — changes app code, so A6 rebuild required |
| ~~A4~~ | ~~**Surah-header ornament**~~ — decision taken to ship the trace as-is | 5 | ✅ **Closed 22 Aug 2026** (risk accepted) |
| A5 | Record the foreground-service demo video (playback → background → notification controls) | 3 | **Yes** |
| A6 | Rebuild + re-sign the AAB — **required twice over: the current bundle predates both Content Sync (A1) and the A3 address change** | 8 | **Yes** |

#### B. Blocked on someone else — chase these in parallel

| # | Task | § | Blocking |
|---|---|---|---|
| ~~B1~~ | ~~**QF reply — Content Sync scope**~~ — answered: express permission granted under §3.1(3)(a) | 5 | ✅ **Resolved 21 Aug 2026** |
| ~~B2~~ | ~~**QF reply — surah-header artwork**~~ — QF cannot grant on KFGQPC's behalf; proceeding without a reply | 5 | ✅ **Closed 22 Aug 2026** (risk accepted) |
| B3 | Recruit ~12 testers and start the closed test — 14 **continuous** days | 8 | **Yes** |
| ~~B4~~ | ~~**QF client secret rotation**~~ | 7 | ✅ **Done 11 Sep 2026** |

#### C. Paperwork — no dependencies, do any time

All the copy and questionnaire answers now live in **`PLAY-LISTING-COPY.md`**,
ready to paste. What remains in C is console entry, hosting, and two decisions.

| # | Task | § | Blocking | Status |
|---|---|---|---|---|
| C1 | Short description (≤80 chars) | 6 | **Yes** | ✅ Drafted — EN + AR, 3 options each |
| C2 | Full description (≤4000 chars) | 6 | **Yes** | ✅ Drafted — EN 2,794 / AR 2,497 chars |
| C3 | Data safety form — answers in §2 | 2 | **Yes** | ✅ Submitted 11 Sep 2026 — ⚠️ see the Deepgram retention caveat in §2 |
| C4 | Foreground service declaration (§3 has the justification) | 3 | **Yes** | ✅ Submitted 11 Sep 2026 — demo video (A5) still required |
| C5 | Content rating questionnaire (expect "Everyone") | 6 | **Yes** | ✅ Pre-answered, every question |
| C6 | Target audience & content declaration | 6 | **Yes** | ✅ Pre-answered — 13+ |
| C7 | Category — Books & Reference, or Lifestyle | 6 | **Yes** | ✅ Decided — Books & Reference |
| C8 | Create the Play listing | 8 | **Yes** | ✅ Done 11 Sep 2026 |
| C9 | Host `privacy.html` + `terms.html` in the same directory; add URL to the listing | 5 | **Yes** | ✅ Done 11 Sep 2026 — GitHub Pages, `gh-pages` branch |
| C10 | Confirm the Deepgram / Cloudflare / jsDelivr / QF policy links resolve | 5 | No | ✅ Done 11 Sep 2026 — found + fixed a dead QF link |
| ~~C11~~ | ~~**Android Auto declaration**~~ — **declared now**, against the recommendation below | 6 | ✅ **Decided 11 Sep 2026** — submission now also goes through car-app quality review |
| C12 | Apply for production access | 8 | **Yes** — last step | Console only |

**Critical path:** B3 is the only long pole — 14 **continuous** days, and nothing
gates starting it, so recruit testers today. Credential rotation (B4) is complete,
so nothing is blocked on a third party any more.

The privacy policy is filled in, hosted, link-checked and in the listing
(A2, A3, C9, C10). What remains that touches the app is **A5** (foreground-service
demo video — the most commonly underestimated item) and **A6** (rebuild + re-sign
the AAB). A6 is doubly required now: the current bundle predates Content Sync
*and* predates the A3 address change.

Note the privacy-link fix touched only the hosted page, not the app, so it does
not itself force a rebuild.

Console entry is done — the listing is created and the Data safety and
foreground-service declarations are submitted (C3, C4, C8). Android Auto is
**declared** (C11), so the submission also goes through car-app quality review.
What is left in C is production access (C12), the last step, gated on the closed
test finishing.

⚠️ Two submitted answers are conditional and worth re-checking before release:
the Data safety "processed ephemerally" claim depends on Deepgram's retention
setting (§2), and the foreground-service declaration still needs its demo
video (A5).

> ⚠️ **Tripwire for the subscription tier.** The content rating answers
> "no digital purchases" and "no user interaction" are correct for versionCode 2
> only. When the RevenueCat Pro tier ships, digital purchases becomes **Yes**
> and the rating questionnaire must be re-run *before* that build goes out.
> Sign-in is now built, so §4's account-deletion requirement applies to the
> first build with `REACT_APP_ACCOUNTS=on`: the hosted deletion page and the
> redone Data safety form must be live before that build is released.

### Done

| Item | When |
|---|---|
| Credentials rotated, verified through the broker | 13 Aug 2026 |
| Android Auto in-car regression pass | 13 Aug 2026 |
| Token broker deployed + `verify-deploy.sh` passing | 15 Aug 2026 |
| Recite mode smoke-tested against the live broker | 15 Aug 2026 |
| ~~Signed AAB~~ — built, but **now stale**: predates Content Sync. Rebuild required (A6) | — |
| Listing assets — icon, feature graphic, 4 × 9:16 screenshots in `play-assets/` | — |
| Account deletion was out of scope while the app had no sign-in; now required, see §4 | 29 Oct 2026 |
| Privacy policy rewritten, incl. the QF developer-privacy pass | Aug 2026 |
| Source TODOs — Settings persisted data, Mushaf page layout | 15 Aug 2026 |
| Listing copy + questionnaires (C1, C2, C5, C6, C7) — `PLAY-LISTING-COPY.md` | 20 Aug 2026 |
| QF express permission for offline Quran script (§3.1(3)(a)) — `docs/licensing-decisions.md` | 21 Aug 2026 |
| **Content Sync implemented and merged** — tafsirs + recitations, verified live | 22 Aug 2026 |
| KFGQPC ornament — decision taken to ship without KFGQPC permission | 22 Aug 2026 |
| Postal address filled in + mirrored in-app (A2/A3) | 11 Sep 2026 |
| Privacy policy + terms hosted on GitHub Pages, listing updated (C9) | 11 Sep 2026 |
| Processor links verified; dead QF privacy link fixed (C10) | 11 Sep 2026 |
| QF client secret rotated — credential rotation now complete (B4) | 11 Sep 2026 |
| Play listing created; Data safety + foreground-service declarations submitted (C3, C4, C8) | 11 Sep 2026 |
| Android Auto declared in the listing — car-app review accepted (C11) | 11 Sep 2026 |
| Play entry recreated with the correct package name after a typo in the first one | 11 Sep 2026 |

---

## 1. What the app actually collects

Established by auditing the manifest and every outbound host. Sign-in is
optional and asks only for the basic profile (name, email); it requests no
Google or Apple API scopes beyond that.

**Permissions declared** (`AndroidManifest.xml`):

| Permission | Why |
|---|---|
| `INTERNET` | Quran content, audio, translations |
| `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | background/Android Auto recitation playback |
| `RECORD_AUDIO` | recite mode — live recitation matching |
| `MODIFY_AUDIO_SETTINGS` | audio focus handling during playback |

**Outbound hosts:**

| Host | Purpose | Data sent |
|---|---|---|
| `apis.quran.foundation` | Quran text, translations, tafsir, audio timestamps | none personal (via token broker) |
| `verses.quran.foundation` | recitation audio files | none |
| `api.deepgram.com` (wss) | recite mode speech-to-text | **live microphone audio** |
| `stt-rt.soniox.com` (wss) | recite mode speech-to-text (if selected in Settings) | **live microphone audio** |
| `api.revenuecat.com` | Rafeeq Pro subscription status (builds with a RevenueCat key) | app-user id (the account id once signed in, else anonymous), purchase history |
| `<project>.supabase.co` | accounts: sign-in, `delete-account` and `apple-token` edge functions (builds with `REACT_APP_ACCOUNTS=on`) | account id, email, name, sign-in provider; on iOS the Sign in with Apple authorization code |
| Google / Apple sign-in | proving identity when the user signs in | handled by the Google / Apple sign-in UI; we receive name + email |
| `cdn.jsdelivr.net` | QPC mushaf fonts | none |

**User sign-in:** optional, only for Rafeeq Pro, and only in builds with
`REACT_APP_ACCOUNTS=on`. Google (Android) or Apple (iOS; Android when
`REACT_APP_APPLE_SIGNIN=on`) through Supabase Auth. The account holds an id,
email, name and provider; on iOS Apple's refresh token is kept server-side
(`apple_tokens`) only so deletion can revoke it. Without the switch the app
has no accounts, and the token broker only fetches machine-to-machine tokens
for the content API. Notes, bookmarks, and the Hifz streak are local-only
either way (no sync exists yet).

---

## 2. Data safety form — answers

**Does your app collect or share any of the required user data types?** → **Yes**

### Audio → Voice or sound recordings
- Collected: **Yes** · Shared: **Yes** (with the transcription provider selected in Settings: Deepgram or Soniox)
- Processed ephemerally: **Yes** — audio streams live over a WebSocket to Deepgram or
  Soniox for real-time transcription. It is never written to disk or retained by the app.
- Required or optional: **Optional** — only recite mode uses the mic.
- Purpose: **App functionality**

> ⚠️ **Still open, and now load-bearing — the form was submitted on 11 Sep 2026
> declaring "processed ephemerally".** That answer depends on Deepgram's retention
> setting, which lives in your Deepgram account, not in this repo. If their default
> retains audio or transcripts, the declaration is inaccurate as filed and the Data
> safety form must be corrected to disclose retention. Verify it in the Deepgram
> dashboard; an incorrect Data safety declaration is an enforcement risk, not a
> cosmetic one.
>
> - [x] **Soniox confirmed (24 Oct 2026).** Its privacy policy states that
>       "real-time API requests are processed transiently and are not stored",
>       so "processed ephemerally" holds for Soniox. Deepgram is still open
>       (above).
> - [x] **Hosted privacy policy updated (24 Oct 2026).** `privacy.html` and
>       `privacy-ar.html` on `gh-pages` name Deepgram and Soniox as the speech
>       engines and RevenueCat / Google Play for Rafeeq Pro; the terms gained a
>       subscription section.

### Personal info → Name, Email address, User IDs
Applies to the build with `REACT_APP_ACCOUNTS=on` (redo the form before it
ships; the currently submitted form says "No", which is right only while the
switch is off).
- **Name** and **Email address**: Collected **Yes** · Shared **No** (held by
  Supabase as our service provider, which Play does not count as sharing) ·
  Processed ephemerally **No** · **Optional** (sign-in is only needed for
  Rafeeq Pro) · Purpose **Account management**.
- **User IDs** (the Supabase account id, also used as the RevenueCat app-user
  id): same answers, Purpose **Account management** (add **App
  functionality** — it links the Pro subscription to the account).

### Financial info → Purchase history
- Collected **Yes** (subscription purchases, via Google Play billing and
  RevenueCat) · Shared **No** if RevenueCat is treated as a service provider
  (confirm against Play's current rule when filling the form; answer Yes if in
  doubt) · **Optional** · Purpose **App functionality** (subscription status).

### App activity → Other user-generated content
- Notes, bookmarks, and the Hifz streak stay on the device and are never
  transmitted, so under Play's definition this is **not collected**.
- Collected: **No**

### Not collected
No location, contacts, photos, files, financial info, health data, or advertising
identifiers. No analytics or ad SDKs are present. (This changes with the first
build that carries a RevenueCat key: purchase history and an app-user id go
to RevenueCat — see §9.) All reading progress, bookmarks, and cached audio stay
on-device (IndexedDB + Capacitor Preferences), signed in or not.

### Security practices
- Data encrypted in transit: **Yes** (all endpoints HTTPS/WSS)
- Users can request data deletion: **Yes** — in the app (Account → Delete
  account) and on the web at the deletion URL in §4. Uninstalling or clearing
  storage removes the on-device data. Deleting the account removes the account
  and the RevenueCat record.
- **Delete-account URL** (Play Console → App content → Data safety → "Add a
  link that users can use to request account and data deletion"):
  `<LEGAL_BASE_URL>/delete-account.html`.

### App access (App content → App access)
Part of the app is behind a login (Rafeeq Pro), so Play's reviewers need
credentials. Choose "All or some functionality is restricted", and give a
**reviewer test Google account** that has been granted **promotional Pro** in
RevenueCat (Customers → the account's id → Grant promotional entitlement), plus
instructions: *Account → Sign in with Google → use the account above; Recite
Mode is unlocked.* Keep that Google account's password out of the repo.

---

## 3. Foreground service declaration

Required because the app declares `FOREGROUND_SERVICE_MEDIA_PLAYBACK`.

- **Type:** Media playback
- **Justification (paste into the console):**
  > Rafeeq plays Quran recitation audio. The foreground service keeps playback
  > running when the screen is off or the app is backgrounded, and powers the
  > Android Auto media browser so users can listen while driving. Playback is always
  > started by the user and is controllable from the notification, the lock screen,
  > and the car's head unit.
- **Demo video:** Google usually requires one. Record a screen capture showing:
  start playback → background the app → playback continues with a visible
  notification → pause/skip from the notification. Upload unlisted to YouTube and
  paste the link.

---

## 4. Account deletion — REQUIRED (once `REACT_APP_ACCOUNTS=on` ships)

Play's rule is triggered by **account creation**. Signing in with Google or
Apple creates a Rafeeq account (Supabase), so the first build with
`REACT_APP_ACCOUNTS=on` needs both an in-app deletion path and a public
deletion URL; Apple's Guideline 5.1.1(v) requires the same on iOS, including
revoking the Sign in with Apple grant. Builds without the switch still have
no accounts and need neither. (Adding Google also obliges offering Sign in
with Apple on iOS — Guideline 4.8 — which the app does.)

**In-app path:** Account page → Account section (shows name + email) →
**Delete account** → "Delete your account?" sheet listing what is removed →
**Delete account** to confirm (**Keep account** cancels) → "Account deleted".
The sheet's note tells the user the store subscription is not cancelled.

**Public URL (paste into the Data safety form):**
`<LEGAL_BASE_URL>/delete-account.html`, Arabic at `delete-account-ar.html`.
`LEGAL_BASE_URL` is the constant in `src/app/features/account/Account.tsx`
(`https://omokhtarr.github.io/Rafeeq-Cross-Platform`). The page lives on the
`gh-pages` branch alongside `privacy.html` and `terms.html`; it is not live
until `gh-pages` is pushed. It describes the in-app steps, the email route
(`or.mokhtar@gmail.com`), what is deleted and that the store subscription must
be cancelled separately.

**What the `delete-account` Edge Function deletes, in order**
(`supabase/functions/delete-account/handler.ts`):
1. **Apple revoke**: if `apple_tokens` holds a refresh token for the user, it
   is revoked with Apple. Uses `APPLE_TEAM_ID`, `APPLE_KEY_ID`,
   `APPLE_PRIVATE_KEY`; without them a stored token makes the call fail
   (502) rather than delete the account with Apple's grant left live.
2. **RevenueCat**: `DELETE /v1/subscribers/<account id>` using
   `REVENUECAT_SECRET_KEY` (an already-missing customer counts as success).
3. **The auth user** (Supabase `auth.admin.deleteUser`). Foreign keys cascade
   to every per-user table, including `apple_tokens`.

The auth user goes last and any failing step returns 502 with nothing after it
run, so a retry still finds the account and can finish the job.

**Email-request runbook.** A user who cannot open the app emails
`or.mokhtar@gmail.com`. Reply to the sender and ask them to confirm from the
email address registered on the account (or otherwise confirm the account is
theirs) **before** running anything. Complete the deletion within 30 days of the
request, then:

```bash
SUPABASE_URL=https://<project-ref>.supabase.co \
ADMIN_DELETE_SECRET=<the Edge Function secret of the same name> \
  scripts/delete-account.sh <user-id | email>
```

The script posts to the same function with an `x-admin-secret` header (the
function's gateway JWT check is off; the function authenticates both paths
itself), prints the HTTP status and body, and exits non-zero unless 2xx.
Respond within 30 days (the privacy policy's promise). Look the user up in
Supabase → Authentication → Users if you only have the email and want the id.

> **Known limit — Apple accounts created through the Android web flow.**
> Apple token revocation covers iOS sign-ins only. On iOS the app sends Apple's
> authorization code to the `apple-token` edge function, which stores the
> refresh token (with the client id it was issued to) in `apple_tokens`;
> `delete-account` revokes it. On Android, Sign in with Apple runs through
> Supabase's web flow in a browser tab, which never gives the app a code, so
> those accounts have no stored token and deletion skips the revoke for them.
> The account is still deleted; Apple's grant stays until the user removes it
> in their Apple ID settings. The hosted deletion page tells users so.

**Data deletion (as distinct from account deletion):** on-device data
(notes, bookmarks, streaks, settings) is still removed by uninstalling or
clearing storage, which the privacy policy states in section 13.

For the full design and task history of the accounts work, see the Accounts
Part 1 plan (`docs/superpowers/plans/2026-10-29-accounts-part1.md`) and the
design (`docs/superpowers/specs/2026-10-29-accounts-and-pro-sync-design.md`).
The old Quran Foundation OAuth stack that used to be recoverable from git is
unrelated to this and is not needed.

---

## 5. Privacy policy — REWRITTEN, needs hosting

`privacy.html` has been rewritten against what the app actually does. The previous
version claimed local data "never leaves your device" and never mentioned the
microphone, speech recognition, or Deepgram — a direct contradiction with the Data
safety answers above, and a likely rejection.

Now covered: on-device storage, the Deepgram audio stream (opt-in, live-only, never
stored), a "no account required for the free app" section, a table of every outbound
host, an explicit "what the app does not do", and deletion routes. The Account
page opens the hosted pages (via `LEGAL_BASE_URL`), so the hosted files are the
only copy; the bracketed date/contact placeholders are fixed here and in
`terms.html`.

**29 Oct 2026 — accounts pass** (on the `gh-pages` branch, local until the
owner pushes it): "no account required" became "no account required for the
free app"; new §7 "Accounts and sign-in" names Supabase, Google / Apple
sign-in, the data held (account id, email, name, provider; Apple token on
iOS), retention until deletion and how to delete; RevenueCat is now linked to
the account id; §13 gained account deletion; the terms gained an account
section (§5, later sections renumbered); new `delete-account.html` /
`delete-account-ar.html`. ⚠️ The Supabase region appears as the placeholder
`[REGION]` in `privacy.html` and `privacy-ar.html` (§7 and §9) — replace it
with the real region of the production project **before** pushing.

**Aug 2026 — second pass, against the Quran Foundation developer-privacy
requirements** (email from Basit Minhas, QF Developer Support, and
<https://api-docs.quran.foundation/legal/developer-privacy/>). Added to
`privacy.html` and `terms.html` (an in-app mirror existed then; it has since been removed):

- QF attribution + an explicit "Rafeeq is an independent app, not an official
  Quran Foundation application" disclaimer.
- Religious information treated as **sensitive data**, with Recite Mode framed as
  the affirmative opt-in (two deliberate acts) and how to withdraw consent.
- An explicit "we do not train AI models on your content" commitment covering
  notes/UGC as well as recitation audio, with no repurposing or ad profiling.
- **Cloudflare** added to the third-party processor table (it hosts the token
  broker and sees request IPs) — previously undisclosed. Every processor now
  links to its own privacy policy.
- A **Security** section: TLS in transit, OS-level encryption at rest, secrets
  held as Worker secrets + rotation, minimum API scope, and the commitment to
  report API-related breaches to QF **within 24 hours**.
- Access/correction/deletion consolidated, stating plainly *why* OAuth
  revocation and the 30/90-day server-deletion clauses do not apply (no
  accounts, no QF user login, no user database) rather than copying template
  language that would misdescribe the app.
- International transfers, a 30-day response commitment, and a postal address.
- `terms.html` gained the QF Developer Terms obligations it was missing: no
  modification of the Quran text, no extraction/redistribution/resale of QF
  content or raw API data, personal-use-only, and an acceptable-use clause.

- [x] **Postal address filled in** (11 Sep 2026). Compound Dar Misr, Phase 2 —
      Building 49, Apartment 23, El Shorouk, Cairo, Egypt.
- [x] **Address mirrored into the in-app policy** (11 Sep 2026) — the Contact
      section of `PRIVACY_SECTIONS` in `Account.tsx`, `bodyAr` and `bodyEn` in
      sync. Arabic uses Arabic-Indic numerals to match the surrounding copy;
      `privacy.html` is transliterated, being an English document read by store
      reviewers. ⚠️ This changed app code — the AAB must be rebuilt (A6).
- [x] **Hosted on GitHub Pages** (11 Sep 2026), from an orphan `gh-pages` branch
      holding only the two pages, so serving the site does not publish the source
      tree. Both are live and the Play listing has been updated:

      - <https://omokhtarr.github.io/Rafeeq-Cross-Platform/privacy.html>
      - <https://omokhtarr.github.io/Rafeeq-Cross-Platform/terms.html>

      They link to each other with **relative** hrefs, so they must stay in the
      same directory — do not move one without the other. The deletion page is
      not required (section 4).
- [x] **Processor links checked** (11 Sep 2026). Deepgram, Cloudflare, jsDelivr
      and the QF api-docs link all return 200. **`https://quran.foundation/privacy`
      returned 404** and was replaced with <https://quran.com/privacy> — the
      end-user policy for the service whose content the App consumes. Not to be
      confused with the *Developer* Privacy Policy Packet at
      `api-docs.quran.foundation/legal/developer-privacy/`, which covers our
      obligations to QF rather than the user's data. Worth re-running this check
      whenever the policy is edited.

### Offline caching vs. the QF 7-day rule — RESOLVED

QF's Developer Terms say not to store QF content for more than one week unless
expressly permitted, or via the Content Sync flow with a sync at least every
seven days. Rafeeq caches content indefinitely, so both halves of that rule had
to be satisfied. They were closed in two different ways, and the distinction
matters if this is ever audited.

**1. Tafsirs and recitations — closed by implementing Content Sync**
(merged 22 Aug 2026).

- Sync runs against `GET /resources/sync` with `sync_token` checkpoints and
  sequence-ordered mutations; a resource is bootstrapped from its snapshot the
  first time it is tracked.
- Resources become tracked when the user actually downloads them — a tafsir
  download or a cached recitation — so nothing is synced that isn't held.
- Triggered on app resume, throttled to once per 24 h, well inside the 7-day
  obligation. Settings shows the last sync age and warns once it passes 7 days,
  and offers a manual **Sync now** control.
- Eviction is explicit-only: content is untracked when the user removes it or
  the API sends `RESOURCE_DELETE`.

Verified end-to-end against the live QF API through the token broker, not just
against mocks — which is how two release-blocking bugs were caught that a fully
green 173-test suite did not (`per_page` above the API maximum, and empty
placeholder records overwriting populated tafsir rows). Details and the
remaining follow-ups are in
`docs/superpowers/specs/2026-08-22-content-sync-followups.md`.

**2. The Quran script — closed by express written permission.**

`/verses/by_page/` is not a syncable resource group, so Content Sync could not
cover it. Quran Foundation granted express permission under **Section 3.1(3)(a)**
of the Developer Terms to store the Quran script and its page-layout/glyph data
locally beyond one week, and to keep it readable offline.

Two conditions ride with that grant and are easy to lose track of:

- It is limited to use inside Rafeeq. No modification, sale, sublicensing,
  export, or redistribution.
- It lasts **until** Content Sync supports the Quran script. QF asked that the
  Content Sync docs be checked roughly weekly; once that support appears, this
  data must migrate onto Content Sync.

The grant, its exact scope, and that ongoing obligation are recorded in
**`docs/licensing-decisions.md`** — in-repo rather than in an inbox, so it
survives a laptop change and is findable at audit time.

> ⚠️ **Known gap, not a blocker.** Android recitation eviction is still a stub:
> `evictRecitation` clears the IndexedDB store used by web/iOS, but on Android
> the blobs are files under `quran-audio/` and that branch does nothing. A
> `RESOURCE_INVALIDATE` for a recitation therefore evicts nothing on the primary
> release platform. This affects content *freshness*, not the retention rule —
> sync still runs and the terms obligation is met. Highest-priority follow-up.

### The traced surah-header ornament — DECISION TAKEN, not resolved

`src/app/shared/components/mushaf-page/surah-banner.art.ts` renders the
illuminated band around each surah title, **traced from an official KFGQPC Madani
page render** and simplified. That makes it a derivative of KFGQPC page artwork
rather than a licensed asset.

QF was asked and **replied that it cannot grant permission on KFGQPC's behalf**:
KFGQPC's own terms control the source artwork, and if those terms are unclear,
KFGQPC should be contacted directly before publishing.

**KFGQPC was not contacted, and no permission was obtained.** The decision taken
on 22 Aug 2026 is to ship the trace and accept the risk. This is recorded as a
*decision to publish without an answer*, not as a determination that the trace is
permitted — the underlying question is still open.

What keeps the exposure contained:

- The surah **name** is not traced; it comes from the openly distributed
  `sura_names` font. Only the surrounding frame was traced.
- The band carries no Quran text, so it does not touch the "Quran text is never
  modified" commitment in `terms.html`.
- Replacement is one exported constant (`SURAH_BANNER_PATH`) in one file, with
  the cartouche window already expressed as fractions. Original artwork drops in
  without touching layout maths — and that remains cheap after release, which is
  what makes accepting the risk reasonable.

Full reasoning in **`docs/licensing-decisions.md` §2**.

---

## 6. Store listing assets

- [x] App icon 512×512 PNG → `play-assets/icon-512.png`
- [x] Feature graphic 1024×500 → `play-assets/feature-graphic-1024x500.png`
- [x] ≥2 phone screenshots → four at 1080×1920 (exact 9:16) in `play-assets/`:
      Home, mushaf, quiz, Azkar. See `play-assets/README.md` for how they were
      produced and the two caveats (no status bar; Hifz empty-state held back).
- [x] Short description (≤80 chars) — **`PLAY-LISTING-COPY.md`**, EN + AR,
      three options each, character counts measured
- [x] Full description (≤4000 chars) — same file. EN 2,794 chars, AR 2,497.
      The Arabic is a parallel version, not a literal translation; the privacy
      paragraph and QF disclaimer are kept faithful in both, since they carry
      compliance weight
- [x] Content rating questionnaire — every IARC question pre-answered in
      `PLAY-LISTING-COPY.md`. Expect "Everyone". Religious content is not a
      rating factor; do not answer Yes to violence on account of scriptural
      references to warfare
- [x] Target audience & content — **13+**. Any under-13 band pulls the app into
      Play's Families policy, and recite mode streams mic audio to Deepgram —
      exactly what draws COPPA scrutiny
- [x] Category: **Books & Reference** (not Lifestyle — it is where Quran.com,
      Tarteel and Ayah sit, and where the browse traffic is)
- [x] **Android Auto — DECLARED** (11 Sep 2026). The listing declares Auto
      support, so the submission goes through Google's **car-app quality review**
      as well as the standard review.

      This was taken **against** the recommendation recorded here, which was to
      hold the declaration for a follow-up release so a car-app rejection could
      not delay the whole launch. Recorded as a decision, not as a resolution of
      the risk — the risk is accepted, not removed.

      What makes it defensible: the in-car regression pass was done in a real car
      and working (13 Aug 2026), and the implementation is a real Media3
      `MediaBrowserService` (`RafeeqMediaService`), not a shim.

      What to expect: car-app review is a separate, stricter track and a common
      source of first-submission rejections. If it rejects, the **whole app** is
      held, not just the Auto surface. The fallback if that happens is to pull the
      Auto declaration from the listing and resubmit on the standard track — the
      Auto code can stay in the build, since the declaration is what triggers the
      review.

      Because Auto is now advertised, the listing description **should** keep its
      Auto bullet, and the store assets should not contradict it.

---

## 7. Credential rotation — ✅ COMPLETE

Both of these were extractable from shipped APKs. Both have now been rotated:

- [x] **Deepgram API key** — rotated and verified live through the broker (13 Aug 2026).
      Mint a new one in the Deepgram dashboard, revoke the old
      one, then `wrangler secret put DEEPGRAM_API_KEY` in `token-broker/`. Never put
      it back in a `.env` file.
- [x] **Quran Foundation client secret** — rotated, confirmed 11 Sep 2026.
      Rotate in the QF dashboard and update the Worker secret. It is no longer
      referenced by the app at all.

Deploy the broker after rotating:

```bash
cd token-broker
wrangler secret put DEEPGRAM_API_KEY
wrangler deploy
```

Confirm `ALLOWED_ORIGIN` on the Worker includes the native origin
(`https://localhost`) as well as any web origin — existing broker calls work from
the app, so it almost certainly already does.

Then re-verify nothing leaked back in:

```bash
npm run build:prod
# neither the Deepgram key nor "clientSecret"/"QuranClient" should appear:
grep -c "clientSecret\|QuranClient" build/static/js/main.*.js
```

---

## 8. Release checklist order

1. ~~Rotate both credentials~~ — done 13 Aug 2026, verified live through the broker
   (QF content token returns 200 with a valid token)
1b. ~~Deploy the broker~~ — done, verified 15 Aug 2026.
   `verify-deploy.sh` confirms `/deepgram/token` mints a real `asr:write` grant
   rather than falling through to the Quran Foundation handler.
2. ~~Smoke-test recite mode against the deployed broker~~ — done, working
3. ~~Android Auto regression pass in a real car~~ — done, working (13 Aug 2026)
4. ~~Host the privacy policy (section 5)~~ — done 11 Sep 2026, live on GitHub
   Pages and in the listing; processor links verified
5. **Rebuild + re-sign the AAB (`gradlew bundleRelease`)** — ⚠️ the existing
   `Rafeeq-1.1.0-release.aab` was built **before** Content Sync merged (22 Aug 2026)
   and before the postal address is filled in, so it is stale. Do not submit it.
   Rebuild after A2/A3, sign with `rafeeq-upload`, and bump `versionCode`
6. ~~Produce the missing listing assets~~ — done, in `play-assets/`: 512×512 PNG
   icon, 1024×500 feature graphic, and four 9:16 screenshots
7. Create the Play listing, complete Data safety + foreground service declarations
8. Start the closed test — ~12 testers × 14 continuous days (personal accounts)
9. Apply for production access
10. Accounts and the Pro gate go out later, in the order in §9 ("Release
    order"): they are not part of the first production submission unless the
    owner decides otherwise.

---

## 9. Rafeeq Pro subscription — launch checklist

Recite mode becomes a paid "Rafeeq Pro" feature (branch `subscription-pro`,
spec `docs/superpowers/specs/2026-10-20-subscription-pro-design.md`). The code
ships dark: the paywall only appears when the app is built with
`REACT_APP_PRO_GATE=on`, and the broker only refuses non-subscribers when
`REQUIRE_PRO = "true"` in `token-broker/wrangler.toml`.

### Setup (owner)
1. **RevenueCat:** project with the Android app (and iOS later); entitlement
   **`com_rafeeq_quranquiz_pro`** (the app and the broker both check this id);
   products `monthly` and `yearly` attached to it; offering "default" (marked
   current) with the Monthly and Annual packages. Design a **Paywall** for that
   offering (Arabic + English localizations) — the app shows RevenueCat's
   paywall, not its own page — and turn on **Customer Center**. Copy the public
   SDK key (`goog_…`) into `.env.production` as
   `REACT_APP_REVENUECAT_ANDROID_KEY` (and `REACT_APP_REVENUECAT_IOS_KEY` later).
   For debug-build testing before Play is linked, a **Test Store** key
   (`test_…`) in `.env.local` works; release builds refuse it. CRA lets
   `.env.local` override `.env.production`, so delete the `test_` line before
   building anything for the Play Console.
2. **Play Console:** create the monthly and yearly subscription products (free
   trial optional), link Play's service account in RevenueCat, and add a
   license-tester account for test purchases.
3. **Broker:** `npx wrangler secret put REVENUECAT_SECRET_KEY`, deploy with
   `REQUIRE_PRO` still `"false"`. For browser development, deploy the dev copy
   (`npx wrangler deploy --env dev`, its own secrets via `--env dev`, its
   `ALLOWED_ORIGIN` including `http://localhost:3000`) and point `npm start` at
   it through `.env.development.local`.
4. `npx cap sync`, build, and test purchases from Account → Subscription
   (works while the paywall is off): View subscription → paywall → buy →
   status "active"; reinstall → Restore; Manage subscription opens the
   Customer Center.

### Store declarations — redo before the first build that carries a RevenueCat key

The app starts RevenueCat on every launch of any build whose `.env` has
`REACT_APP_REVENUECAT_ANDROID_KEY` set — even with the paywall switch off —
so that build already sends an anonymous app-user id and purchase data to
RevenueCat. Builds without the key send nothing.
- **Content rating:** digital purchases becomes **Yes** — re-run the
  questionnaire (see the tripwire in §0).
- **Data safety → Financial info → Purchase history:** collected through Google
  Play billing and RevenueCat (a service provider processing it for the app),
  for app functionality (subscription status). Confirm the exact "shared"
  answer against Play's service-provider rule when filling the form.
- ~~**Privacy policy:** add RevenueCat as a processor~~ — done 24 Oct 2026
  (privacy + terms, English and Arabic, live on GitHub Pages).

### Accounts — owner setup

Pro now lives on a signed-in account (Supabase Auth; Google + Apple). All of
this is owner work in dashboards; the code is merged and dark behind
`REACT_APP_ACCOUNTS=on`.

1. **Supabase projects:** one dev, one prod. In each, Settings → JWT Keys must
   use the **asymmetric ES256 signing keys** (the broker refuses legacy HS256
   tokens). Put the prod project URL in `token-broker/wrangler.toml`
   `SUPABASE_URL` and the dev one in `[env.dev.vars]`; put the project ref in
   `supabase/config.toml` `project_id`. Apply the migration
   (`supabase db push` after `supabase link --project-ref <ref>`), which
   creates `apple_tokens`.
2. **Google:** in Google Cloud, OAuth clients — a **Web** client (its id goes
   in `REACT_APP_GOOGLE_WEB_CLIENT_ID` and in Supabase's Google provider) and
   an **Android** client for `com.rafeeq.quranquiz` with the **debug SHA-1
   and the Play App Signing SHA-1** (Play Console → Setup → App signing; the
   upload-key SHA-1 is not enough for Play-distributed builds).
3. **Apple** (when ready — iOS needs a Mac; Android can show it too): an Apple
   **Services ID** and a Sign in with Apple **key**. In Supabase's Apple
   provider set the Services ID and add the **iOS bundle id** among the
   client ids; add `rafeeq://auth/callback` to Supabase's redirect allow-list
   (URL Configuration). Set the Edge Function secrets `APPLE_TEAM_ID`,
   `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_BUNDLE_ID`. Set
   `REACT_APP_APPLE_SIGNIN=on` to show Apple on Android (iOS always shows it).
4. **Edge Function secrets and deploy:** `SUPABASE_SERVICE_ROLE_KEY` (Supabase
   provides it automatically), `REVENUECAT_SECRET_KEY`, and
   `ADMIN_DELETE_SECRET` (a long random value, at least 32 characters; the
   function refuses the admin path without it). Then
   `supabase functions deploy delete-account` and
   `supabase functions deploy apple-token`.
5. **App env** (`.env.production`): `REACT_APP_SUPABASE_URL`,
   `REACT_APP_SUPABASE_PUBLISHABLE_KEY`, `REACT_APP_GOOGLE_WEB_CLIENT_ID`, and
   — only in the build that goes out after the paperwork is live —
   `REACT_APP_ACCOUNTS=on`.
6. **RevenueCat dashboard:** set the transfer behaviour so a purchase stays
   with the account that bought it — "Keep with original App User ID", or
   whatever the dashboard calls it today (verify the name in Project settings
   → Restore behavior) — instead of moving to whichever account restores.
   Create the **reviewer test Google account** and grant it **promotional
   Pro** (Customers → Grant promotional entitlement) for the Play review (§2,
   App access).
7. **`npx cap sync` before the next build.** Two new native plugins,
   `@capacitor/browser` and `@capgo/capacitor-social-login`, are not yet
   registered in the Android project (see the stale-plugins gotcha: until
   synced, ALL npm plugins can fail to register).
8. **Supabase plan:** move the prod project from Free to **Pro** before real
   subscribers' data accumulates — the Free plan has no backups.

### Release order
1. Supabase prod project, Google (and Apple, when ready) set up as above.
2. Worker `SUPABASE_URL` set and deployed; Edge Function secrets set and both
   functions deployed.
3. Legal pages and the deletion page live: replace `[REGION]` in the privacy
   pages, then push `gh-pages`; check `delete-account.html`, `privacy.html`
   and `terms.html` load at `LEGAL_BASE_URL` (and the Arabic ones).
4. Play Data safety redone (§2), including the delete-account URL and the
   App access test account; content rating re-run if not already.
5. Ship a build with `REACT_APP_ACCOUNTS=on` (and the `goog_` RevenueCat key).
6. Then ship a build with `REACT_APP_PRO_GATE=on` in `.env.production`
   (this can be the same build as step 5 once everything above is verified).
7. Then set `REQUIRE_PRO = "true"` in `wrangler.toml` and `npx wrangler deploy`.
8. `PRO_TOKEN=<access token of a signed-in Pro account> bash token-broker/verify-deploy.sh`
   — expect "PASS (enforcement on)" and every route PASS. `PRO_TOKEN` is a real
   Supabase access token for a Pro account (for example the reviewer account),
   not a user id; it expires in about an hour, so use a fresh one.

### iPhone (later, needs a Mac)
`npx cap add ios`; add `NSMicrophoneUsageDescription` (Arabic + English) to
`Info.plist`; create the subscription products in App Store Connect and link
them in RevenueCat; set `REACT_APP_REVENUECAT_IOS_KEY`.
