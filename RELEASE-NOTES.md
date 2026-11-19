# Release Notes

Play Console "What's new" text, one section per build, newest first.
Paste the release name and the block under the latest heading straight into the release form.
Play caps the release name at **50 characters** and each language at **500 characters**.
The release name is only shown in Play Console, never to users.

---

## 1.1.0 (versionCode 24) — not built yet

**Release name:** `24 (1.1.0)`

Changes since 23 (PRs #93, #94, #95). Written ahead of the build:
`versionCode` in `android/app/build.gradle` is still 23 and must be bumped
to 24 before this build is uploaded.

```
<en-US>
• New: Sunnah fasting reminders — a notification the night before Mondays, Thursdays, the White Days, Arafah, Tasu'a, Ashura and the six of Shawwal, so you can plan suhoor and your intention. Turn it on in Settings › Notifications
• Prayer alarms: sound, snooze, vibration and the Ramadan start now have their own Alarm settings page, opened from the gear icon
</en-US>
<ar>
• جديد: تذكير صيام السنة، تنبيه في الليلة السابقة للاثنين والخميس والأيام البيض وعرفة وتاسوعاء وعاشوراء والست من شوال لتجهّز سحورك ونيّتك. فعّله من الإعدادات ← التنبيهات
• منبّهات الصلاة: الصوت والغفوة والاهتزاز وبداية رمضان أصبحت في صفحة «إعدادات المنبّهات» من أيقونة الترس
</ar>
```

---

## 1.1.0 (versionCode 23) — 2026-11-19

**Release name:** `23 (1.1.0)`

Changes since 22 (PRs #90, #91, #92). Madani 1405 now draws the 1421 word
glyphs on its own lines, so its Tajweed colours are exactly 1421's, and it is
the default mushaf for anyone who has not chosen one.

```
<en-US>
• Madani 1405 is now the default mushaf, with the same Tajweed colours and letters as Madani 1421 and the same text size on every page
• The mushaf choices are now named Madani 1421 and Madani 1405
• Quizzes: switching tabs no longer loses your progress — the Quiz tab takes you back, and a "Continue your quiz" card shows where you stopped
</en-US>
<ar>
• أصبح مصحف المدينة ١٤٠٥ المصحف الافتراضي، بألوان التجويد والحروف نفسها في مصحف المدينة ١٤٢١ وبحجم خط ثابت في كل الصفحات
• أصبحت خيارات المصحف: مصحف المدينة ١٤٢١ ومصحف المدينة ١٤٠٥
• الاختبارات: التنقّل بين التبويبات لم يعد يُضيّع تقدّمك، فتبويب الاختبارات يعيدك إليه، وتظهر بطاقة «تابع اختبارك» من حيث توقّفت
</ar>
```

---

## 1.1.0 (versionCode 22) — 2026-11-18

**Release name:** `22 (1.1.0)`

Changes since 20 (PRs #87, #88, #89). Replaces versionCode 21, which was
uploaded but never sent for review: Play blocked it because the portrait
lock made `android.hardware.screen.portrait` a required feature (now
declared optional — no user-visible change).

```
<en-US>
• New mushaf: Madani 1405 with Tajweed colours, in Settings
• Mutashabihat: a new "Between surahs only" option on the Advanced tab
• Long-pressing the play button now reliably switches to recite mode, with a ring that shows the hold and a vibration when it switches
</en-US>
<ar>
• مصحف جديد: مصحف المدينة ١٤٠٥ (تجويد) بألوان التجويد، من الإعدادات
• المتشابهات: خيار جديد «بين السور فقط» في تبويب «متقدم»
• الضغط المطوّل على زر التشغيل يحوّل الآن إلى وضع التسميع بثبات، مع حلقة تُظهر مدة الضغط واهتزاز عند التحويل
</ar>
```

---

## 1.1.0 (versionCode 20) — 2026-11-15

**Release name:** `20 (1.1.0)`

Changes since 19. Recite mode now runs only on Soniox, which users can't see,
so it isn't mentioned. The Pro gate is still off, so recite mode stays free.

```
<en-US>
• Hifz: tap "Sessions Today" to see today's sessions and open any of them in the Quran or a quiz
• Quick Select: a new card plays from the current page to the end of the surah
• The Subscription card on the Account page shows your plan and renewal date
• New guided tours for Feelings, today's sessions and sign-in
• More reliable sync between your phones
• Fixed the exit message appearing when you tap near the edge of the screen
</en-US>
<ar>
• الحفظ: اضغط على «جلسات اليوم» لعرض جلسات اليوم وفتح أي منها في المصحف أو في اختبار
• اختيار سريع: بطاقة جديدة للتلاوة من الصفحة الحالية إلى آخر السورة
• بطاقة الاشتراك في صفحة الحساب تعرض خطتك وموعد التجديد
• جولات تعريفية جديدة لصفحة مشاعري وجلسات اليوم وتسجيل الدخول
• مزامنة أكثر موثوقية بين أجهزتك
• إصلاح ظهور رسالة الخروج عند اللمس قرب حافة الشاشة
</ar>
```

---

## 1.1.0 (versionCode 19) — 2026-11-08

**Release name:** `19 (1.1.0)`

Build 18 was made but never uploaded: it still bundled the Facebook SDK, which
added the advertising ID permission. 19 is 18 with Facebook (and Twitter) left
out of the sign-in plugin, so it declares no advertising ID. Nothing for users
to see in that change, so the notes below are 18's.

Changes since 17: sign-in, Pro on an account with sync, account deletion, the
Android Auto session fixes, the new Feelings page and the restyled pop-up
messages. If 17 never reached
production, its recite-mode notes still need to reach users here. Rafeeq Pro
is named here because the subscription card on the Account page is live, but
the paywall switch is still off, so recite mode stays free. If the switch is on
for this build, add a line saying recite mode is part of Rafeeq Pro.

```
<en-US>
• New: Feelings — pick how you feel and read verses and duas for it (More → Feelings)
• Sign in with Google on the redesigned Account page
• Rafeeq Pro stays with your account, and your notes, Hifz progress, worship tracker and settings sync across your phones
• Delete your account and its data from the Account page
• Android Auto: reopening Rafeeq keeps the recitation playing, and a surah picked in a reciter's folder plays that reciter
• Pop-up messages now match the app's look
</en-US>
<ar>
• جديد: مشاعري — اختر ما تشعر به واقرأ له آيات وأدعية (المزيد ← مشاعري)
• سجّل الدخول بحساب Google من صفحة الحساب بتصميمها الجديد
• يرتبط اشتراك رفيق برو بحسابك، وتتزامن ملاحظاتك وحفظك ومتابعة العبادات وإعداداتك بين أجهزتك
• حذف الحساب وبياناته من صفحة الحساب
• Android Auto: إعادة فتح رفيق لا توقف التلاوة، والسورة المختارة من مجلد قارئ تُتلى بصوته
• رسائل التنبيه بمظهر جديد يناسب التطبيق
</ar>
```

---

## 1.1.0 (versionCode 17) — 2026-10-29

**Release name:** `17 (1.1.0)`

Testing build for real Google Play purchases: the same app as 16, now with the
live RevenueCat (`goog_`) key. The paywall switch is still off, so recite stays
free and Rafeeq Pro is not announced. Keep this build on testing tracks — in
production, people could subscribe to a feature that is still free. The notes
repeat 16's, which never reached production.

```
<en-US>
• Recite mode: recited words now glow green on the mushaf and the quiz cards, and mistakes are underlined
• Recite mode finds your place from any word you start with, and follows more accurately — separated letters, repeated openings, going back
• Recited words appear sooner
• Speech engines in Settings: Deepgram or Soniox
• Account: tap your streak to see every day, month by month, and a tidier layout
</en-US>
<ar>
• وضع التسميع: تتوهّج الكلمات المسمَّعة بالأخضر في المصحف وبطاقات الاختبار، وتُميَّز الأخطاء بخط تحتها
• يحدّد وضع التسميع موضعك من أي كلمة تبدأ بها، ويتابعك بدقة أكبر في الحروف المقطّعة وتكرار المطالع والرجوع للخلف
• تظهر الكلمات المسمَّعة أسرع
• محرّكات التعرّف على الصوت في الإعدادات: Deepgram أو Soniox
• الحساب: اضغط على سلسلة الحفظ لترى كل أيامها شهرًا بشهر، مع ترتيب أوضح للأقسام
</ar>
```

---

## 1.1.0 (versionCode 16) — 2026-10-29

**Release name:** `16 (1.1.0)`

Internal-testing build: it carries Google Play Billing so the Rafeeq Pro
subscriptions can be created in Play Console. The paywall switch is off and no
RevenueCat key is active, so Rafeeq Pro is not mentioned below.

```
<en-US>
• Recite mode: recited words now glow green on the mushaf and the quiz cards, and mistakes are underlined
• Recite mode finds your place from any word you start with, and follows more accurately — separated letters, repeated openings, going back
• Recited words appear sooner
• Speech engines in Settings: Deepgram or Soniox
• Account: tap your streak to see every day, month by month, and a tidier layout
</en-US>
<ar>
• وضع التسميع: تتوهّج الكلمات المسمَّعة بالأخضر في المصحف وبطاقات الاختبار، وتُميَّز الأخطاء بخط تحتها
• يحدّد وضع التسميع موضعك من أي كلمة تبدأ بها، ويتابعك بدقة أكبر في الحروف المقطّعة وتكرار المطالع والرجوع للخلف
• تظهر الكلمات المسمَّعة أسرع
• محرّكات التعرّف على الصوت في الإعدادات: Deepgram أو Soniox
• الحساب: اضغط على سلسلة الحفظ لترى كل أيامها شهرًا بشهر، مع ترتيب أوضح للأقسام
</ar>
```

---

## 1.1.0 (versionCode 15) — 2026-10-19

**Release name:** `15 (1.1.0)`

```
<en-US>
• Recite mode: pick your speech engine in Settings — Deepgram or Soniox
• Search: open a verse's tafsir straight from its search result
• Mushaf: fixed 25 pages that started at the wrong verse; hiding verses now covers the whole page
• Tafsir: no more stray code in downloaded tafsir, and Back from Tafsir Settings returns you where you were
• Recite mode is more reliable, and content sync no longer fails for some resources
</en-US>
<ar>
• وضع التسميع: اختر محرك التعرّف على الصوت من الإعدادات — Deepgram أو Soniox
• البحث: افتح تفسير الآية مباشرة من نتيجة البحث
• المصحف: تصحيح بداية ٢٥ صفحة، وإخفاء الآيات يغطي الصفحة كاملة
• التفسير: إزالة الرموز الزائدة من التفسير المحمّل، والرجوع من إعدادات التفسير يعيدك إلى حيث كنت
• تحسين ثبات وضع التسميع، وإصلاح تعثّر مزامنة المحتوى لبعض المصادر
</ar>
```
