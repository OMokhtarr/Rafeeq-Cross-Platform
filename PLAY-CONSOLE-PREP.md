# Play Console prep — Rafeeq

Everything needed for the Play Store listing, derived from what the app actually
declares and does. Answers here are meant to be copied into the console verbatim.

App: **Rafeeq** · package `com.rafeeq.quranquiz` · versionCode 2 / versionName 1.1.0

> ⚠️ **Blocking before public release:** rotate the Deepgram API key and the Quran
> Foundation client secret. Both shipped inside the JS bundle of earlier builds and
> are extractable from any APK already distributed. The broker fix (commit `c18be0b`)
> stops future leakage but cannot recall what already shipped. See section 7.

---

## 1. What the app actually collects

Established by auditing the manifest and every outbound host. The app has no
sign-in, so there are no user OAuth scopes to audit.

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
| `cdn.jsdelivr.net` | QPC mushaf fonts | none |

**User sign-in:** none. The app has no accounts and requests no OAuth user
scopes — the token broker only ever fetches machine-to-machine tokens for the
content API. Notes, bookmarks, and both streaks (Hifz and quiz) are local-only.

---

## 2. Data safety form — answers

**Does your app collect or share any of the required user data types?** → **Yes**

### Audio → Voice or sound recordings
- Collected: **Yes** · Shared: **Yes** (with Deepgram, the transcription provider)
- Processed ephemerally: **Yes** — audio streams live over a WebSocket for real-time
  transcription and is never written to disk or retained by the app.
- Required or optional: **Optional** — only recite mode uses the mic.
- Purpose: **App functionality**

> Verify Deepgram's own retention setting in your Deepgram account before submitting.
> If their default retains audio/transcripts, "processed ephemerally" no longer holds
> and you must disclose retention instead.

### Personal info → Name / Email
- Collected: **No** — the app has no sign-in and never asks for a name or email.

### App activity → Other user-generated content
- Notes, bookmarks, and the Hifz and quiz streaks stay on the device and are never
  transmitted, so under Play's definition this is **not collected**.
- Collected: **No**

### Not collected
No location, contacts, photos, files, financial info, health data, or advertising
identifiers. No analytics or ad SDKs are present. All reading progress, bookmarks,
and cached audio for signed-out users stay on-device (IndexedDB + Capacitor
Preferences).

### Security practices
- Data encrypted in transit: **Yes** (all endpoints HTTPS/WSS)
- Users can request data deletion: **Yes** — uninstall or clear storage removes
  everything; nothing is stored off-device. See section 4.

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

## 4. Account deletion — NOT REQUIRED (no account creation)

Play's deletion requirement is triggered by **account creation**, not by storing
data. Rafeeq has no sign-in and creates no user identity, so neither the in-app
deletion path nor the public deletion URL applies. Google's definition:

> "If your app allows users to create an account from within your app, our User
> data policy requires that it must also allow users to request for their account
> to be deleted." … "Accounts that are created and operated offline are not app
> accounts and do not fall within policy scope."

Apple's Guideline 5.1.1(v) uses the same trigger, so the iOS build is equally
out of scope.

The in-app "Delete Account & Data" row and its modal have been removed, along
with `delete-account.html` and the OAuth relay `index.html`. All of it is
recoverable from git history — see below.

> ⚠️ **This reverses the moment sign-in is added.** Sign in with Google or Apple
> counts as account creation on both stores (Google names "SSO" in its list of
> account mechanisms; Apple treats social login the same as email signup). If
> sign-in ships — especially with any server-side backup of user data — you must
> restore: an in-app deletion path, a hosted public deletion URL for Play, actual
> deletion of the server-side record, and **Apple token revocation via their REST
> API** for Sign in with Apple.
>
> Note also **Apple Guideline 4.8**: adding Google Sign-In *alone* obliges you to
> offer Sign in with Apple as an equivalent option. Adding one means adding both.

### Recovering the sign-in code

All sign-in files were deleted from the working tree but remain in git history.
To restore them:

```bash
# The last commit where the auth stack was intact:
git show d1aba6f --stat

git checkout d1aba6f -- src/app/core/services/auth/oauth.service.ts
git checkout d1aba6f -- src/app/core/services/auth/AuthCallback.tsx
git checkout d1aba6f -- src/app/core/services/api/user-api.client.ts   # QF user API
git checkout d1aba6f -- delete-account.html                            # deletion page
git checkout d1aba6f -- index.html                                     # OAuth relay page
```

Also needed when re-adding sign-in:
- The `com.rafeeq.quranquiz` deep-link `<intent-filter>` in
  `android/app/src/main/AndroidManifest.xml` (removed; see history).
- The `appUrlOpen` listener and `/auth/callback` route in `src/App.tsx`.
- `token-broker/src/index.ts` still exposes `/oauth2/token` — it was left in
  place and is simply unused, so no broker redeploy is needed to restore it.

Bear in mind the old stack was **Quran Foundation OAuth**, not Google/Apple. It
is a reference for the wiring (PKCE, token storage, deep-link callback), not a
drop-in for a different identity provider.

**Data deletion (as distinct from account deletion)** is still answered on the
data-safety form: users uninstall or clear storage, which removes everything,
since nothing leaves the device. `privacy.html` §6 states this.

---

## 5. Privacy policy — REWRITTEN, needs hosting

`privacy.html` has been rewritten against what the app actually does. The previous
version claimed local data "never leaves your device" and never mentioned the
microphone, speech recognition, or Deepgram — a direct contradiction with the Data
safety answers above, and a likely rejection.

Now covered: on-device storage, the Deepgram audio stream (opt-in, live-only, never
stored), an explicit "no account required" section, a table of every outbound host,
an explicit "what the app does not do", and deletion routes. The same corrected
text is mirrored in-app (`PRIVACY_SECTIONS` in `Account.tsx`), and the bracketed
date/contact placeholders are fixed here and in `terms.html`.

- [ ] **Host `privacy.html`** (GitHub Pages, Cloudflare Pages, or alongside the
      token broker) and put the URL in the listing. This is the only page that
      must be hosted — the deletion page is no longer required (section 4).
- [ ] Confirm the Deepgram privacy-policy link and the Quran Foundation
      privacy-policy link both resolve.

---

## 6. Store listing assets

- [ ] App icon 512×512 PNG (source: `assets/icon.png`)
- [ ] Feature graphic 1024×500
- [ ] ≥2 phone screenshots (16:9 or 9:16, min 320px) — Home, mushaf, quiz, Hifz
- [ ] Short description (≤80 chars)
- [ ] Full description (≤4000 chars)
- [ ] Content rating questionnaire (expect "Everyone"; it is religious/educational
      content with no objectionable material)
- [ ] Target audience & content — declare whether children are a target audience
- [ ] Category: Books & Reference, or Lifestyle
- [ ] **Android Auto:** the listing triggers an extra car-app quality review. Do not
      submit until the on-device Auto regression pass is done.

---

## 7. Credential rotation (blocking)

Both of these were extractable from shipped APKs:

- [ ] **Deepgram API key** — mint a new one in the Deepgram dashboard, revoke the old
      one, then `wrangler secret put DEEPGRAM_API_KEY` in `token-broker/`. Never put
      it back in a `.env` file.
- [ ] **Quran Foundation client secret** — rotate in the QF dashboard and update the
      Worker secret. It is no longer referenced by the app at all.

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

1. Rotate both credentials, deploy the broker (section 7)
2. Smoke-test recite mode against the deployed broker
3. Android Auto regression pass in a real car
4. Host the privacy policy (section 5) — no deletion page needed
5. Build the signed AAB (`gradlew bundleRelease`)
6. Create the Play listing, complete Data safety + foreground service declarations
7. Start the closed test — ~12 testers × 14 continuous days (personal accounts)
8. Apply for production access
