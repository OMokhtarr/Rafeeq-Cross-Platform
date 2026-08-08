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

Established by auditing the manifest, the OAuth scopes, and every outbound host.

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
| `oauth2.quran.foundation` | optional user sign-in | OAuth code exchange |
| `verses.quran.foundation` | recitation audio files | none |
| `api.deepgram.com` (wss) | recite mode speech-to-text | **live microphone audio** |
| `cdn.jsdelivr.net` | QPC mushaf fonts | none |

**OAuth scopes requested:** `openid profile offline_access` plus
`streak`, `goal`, `note`, `activity_day` (read/create/update/delete variants).

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

### Personal info → Name / Email (only if signed in)
- Collected: **Yes** · Shared: **No**
- Optional: **Yes** — sign-in is not required to use the app.
- Purpose: **Account management, App functionality**
- Note: handled by Quran Foundation under their privacy policy; the `profile` scope
  is requested at sign-in.

### App activity → Other user-generated content
- Covers streaks, goals, notes, reading activity synced under the OAuth scopes above.
- Collected: **Yes** · Shared: **No** · Optional: **Yes** (sign-in only)
- Purpose: **App functionality**

### Not collected
No location, contacts, photos, files, financial info, health data, or advertising
identifiers. No analytics or ad SDKs are present. All reading progress, bookmarks,
and cached audio for signed-out users stay on-device (IndexedDB + Capacitor
Preferences).

### Security practices
- Data encrypted in transit: **Yes** (all endpoints HTTPS/WSS)
- Users can request data deletion: **Yes** — see section 4.

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

## 4. Account deletion — WRITTEN, needs hosting

Play requires both an **in-app** path and a **publicly reachable web URL**, and the
URL must be usable *without* installing the app. Both now exist:

- **`delete-account.html`** — separates on-device data (immediate, self-service:
  uninstall or clear storage) from Quran Foundation account data (request-based,
  with a contact address and a 7-day acknowledgement commitment).
- **In-app:** Account → LEGAL → **"Delete Account & Data"**, showing the same
  content plus an "Open deletion page" button. Verified rendering on the emulator.

- [ ] **Host `delete-account.html`** and put the URL in the Play Console's
      "Data deletion" field.
- [ ] If the hosted URL is not `https://rafeeq.app/delete-account.html`, update
      `DELETE_ACCOUNT_URL` at the top of `src/app/features/account/Account.tsx`.

---

## 5. Privacy policy — REWRITTEN, needs hosting

`privacy.html` has been rewritten against what the app actually does. The previous
version claimed local data "never leaves your device" and never mentioned the
microphone, speech recognition, or Deepgram — a direct contradiction with the Data
safety answers above, and a likely rejection.

Now covered: on-device storage, the Deepgram audio stream (opt-in, live-only, never
stored), optional Quran Foundation sync with its real scopes, a table of every
outbound host, an explicit "what the app does not do", and deletion routes. The
same corrected text is mirrored in-app (`PRIVACY_SECTIONS` in `Account.tsx`), and
the bracketed date/contact placeholders are fixed here and in `terms.html`.

- [ ] **Host `privacy.html`** (GitHub Pages, Cloudflare Pages, or alongside the
      token broker) and put the URL in the listing.
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
4. Host the privacy policy + deletion page (sections 4–5)
5. Build the signed AAB (`gradlew bundleRelease`)
6. Create the Play listing, complete Data safety + foreground service declarations
7. Start the closed test — ~12 testers × 14 continuous days (personal accounts)
8. Apply for production access
