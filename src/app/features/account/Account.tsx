import React, { useCallback, useEffect, useRef, useState } from "react";
import { IonPage, IonContent, useIonViewWillEnter } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useLang } from "../../core/context/LanguageContext";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import {
  fetchAllNotes,
  deleteNote,
  type Note,
} from "../../core/services/storage/notes.service";
import {
  loadPlanAsync,
  settleHifzFreezes,
  type PlanSession,
} from "../hifz/hifz.service";
import StreakPanel from "./StreakPanel";
import {
  exportBackupToFile,
  parseBackup,
  readBackupFile,
  restoreBackup,
  summarizeBackup,
  BackupError,
  type BackupSummary,
} from "../../core/services/storage/backup.service";
import AccountModal from "./AccountModal";
import "./Account.css";

type ModalType =
  | "about"
  | "request"
  | "terms"
  | "privacy"
  | "restore"
  | null;

/**
 * Legal prose. Each section carries both languages side by side (same shape as
 * TAJWEED_RULES in Settings) so the Arabic and English can never drift apart
 * section-by-section the way two parallel arrays would.
 */
interface ProseSection {
  headingAr: string | null;
  headingEn: string | null;
  bodyAr: string;
  bodyEn: string;
}

const PRIVACY_SECTIONS: ProseSection[] = [
  {
    headingAr: null,
    headingEn: null,
    bodyAr: "يلتزم تطبيق رفيق (\"التطبيق\") بحماية خصوصيتك. توضح هذه السياسة كيفية تعاملنا مع بياناتك.\nورفيق تطبيق مستقل يستخدم واجهات Quran Foundation البرمجية ويعرض النص القرآني والتفسير والتلاوات من Quran.com. وهو ليس تطبيقًا رسميًا لمؤسسة القرآن، ولا يتبعها ولا تعتمده.",
    bodyEn: "Rafeeq (\"the App\") is committed to protecting your privacy. This policy explains how we handle your data.\nRafeeq is an independent app that uses the Quran Foundation APIs and displays Quran text, tafsir and recitation audio from Quran.com. It is not an official Quran Foundation application, and is not endorsed by or affiliated with the Foundation.",
  },
  {
    headingAr: "١. البيانات المحفوظة على جهازك",
    headingEn: "1. Data stored on your device",
    bodyAr: "تُحفظ تفضيلاتك ومواضعك المحفوظة وملاحظاتك وموضع القراءة وتقدّم الحفظ وسلاسل المواظبة، إضافة إلى النص القرآني والتفسير والخطوط والمقاطع الصوتية المُنزَّلة، على جهازك فقط. وإلغاء تثبيت التطبيق، أو مسح مساحة تخزينه من إعدادات أندرويد، يحذفها جميعًا نهائيًا.",
    bodyEn: "Your preferences, bookmarks, notes, reading position, memorisation progress and streaks, plus cached Quran text, tafsir, fonts and downloaded audio are stored only on your device. Uninstalling the App, or clearing its storage in Android settings, removes all of it permanently.",
  },
  {
    headingAr: "٢. وضع التلاوة والميكروفون",
    headingEn: "2. Recite Mode and your microphone",
    bodyAr: "وضع التلاوة هو الميزة الوحيدة التي تُرسل صوتًا خارج جهازك، وهو غير مُفعَّل افتراضيًا أبدًا، ولا يعمل إلا أثناء استخدامك له فعليًا.\nلتحويل الكلام إلى نص، يبثّ التطبيق صوت الميكروفون في الوقت الفعلي إلى Deepgram، وهي شركة للتعرّف على الكلام مقرّها الولايات المتحدة. ويُبثّ الصوت لغرض النسخ النصي فقط: فالتطبيق لا يسجّل صوتك في ملف، ولا يحتفظ بالصوت، ولا يرسله إلى أي جهة أخرى. ويُستخدم النص الناتج فقط لمتابعة الآية المعروضة على الشاشة، ويُتلَف بانتهاء الجلسة. ويطلب أندرويد إذن الميكروفون عند أول استخدام لوضع التلاوة؛ وإذا رفضت، يعمل باقي التطبيق بصورة طبيعية.",
    bodyEn: "Recite Mode is the only feature that sends audio off your device, it is never on by default, and it runs only while you are actively using it.\nTo turn speech into text, the App streams your microphone audio in real time to Deepgram, a speech-recognition provider based in the United States. Audio is streamed for transcription only: the App does not record your voice to a file, does not keep the audio, and does not send it anywhere else. The transcribed text is used only to follow along with the verse on screen and is discarded when the session ends. Android asks for microphone permission the first time you use Recite Mode; if you decline, the rest of the App works normally.",
  },
  {
    headingAr: "٣. المعلومات الدينية وموافقتك",
    headingEn: "3. Religious information and your consent",
    bodyAr: "قد يكشف صوت التلاوة وتقدّم الحفظ ونشاط القراءة عن ممارسة دينية، وتعدّها كثير من قوانين الخصوصية بيانات شخصية حسّاسة، ويعاملها رفيق على هذا الأساس.\nولا يُعالَج أي شيء حسّاس تلقائيًا: فنشاط القراءة والحفظ والاختبارات لا يغادر جهازك أصلًا. ووضع التلاوة وحده هو ما يُرسل شيئًا، وهو اختياري تمامًا ويتطلب إجراءين صريحين منك: فتح وضع التلاوة بنفسك، ومنح إذن الميكروفون. ويمكنك سحب هذه الموافقة في أي وقت بإلغاء إذن الميكروفون من إعدادات أندرويد أو بترك استخدام وضع التلاوة، ويسري السحب فورًا.",
    bodyEn: "Recitation audio, memorisation progress and reading activity can reveal religious practice, which many privacy laws treat as sensitive personal data. Rafeeq treats it that way too.\nNothing sensitive is processed by default: reading, memorisation and quiz activity never leave your device at all. Recite Mode is the only feature that transmits anything, it is strictly opt-in, and it requires two deliberate acts — opening Recite Mode yourself and granting microphone permission. You can withdraw that consent at any time by revoking the microphone permission in Android settings or simply not using Recite Mode; withdrawal takes effect immediately.",
  },
  {
    headingAr: "٤. لا ندرّب نماذج ذكاء اصطناعي على محتواك",
    headingEn: "4. We do not train AI models on your content",
    bodyAr: "لا تُستخدم ملاحظاتك وتأمّلاتك ومواضعك المحفوظة وسجلات حفظك وصوت تلاوتك أبدًا لتدريب أي نموذج ذكاء اصطناعي أو تحسينه أو تقييمه، ولا تُباع ولا تُستغل لأي غرض خارج ما تصفه هذه السياسة. ولا نبني أي ملفات تعريف إعلانية أو سلوكية. وإذا تغيّر ذلك يومًا فسيتطلب موافقتك الصريحة المنفصلة أولًا.",
    bodyEn: "Your notes, reflections, bookmarks, memorisation records and recitation audio are never used to train, fine-tune or evaluate any AI model, and are never sold or repurposed beyond the features described in this policy. We build no advertising or behavioural profiles. If that ever changes, it would require your separate, explicit consent first.",
  },
  {
    headingAr: "٥. لا حاجة إلى حساب",
    headingEn: "5. No account required",
    bodyAr: "لا يتضمن التطبيق تسجيل دخول ولا حساب مستخدم. وكل ما يحفظه عنك — المواضع المحفوظة والملاحظات وتقدّم الحفظ وسلسلة الحفظ — يبقى على جهازك. ولا تتم مزامنة أي شيء مع خادم، ولا يُربط أي شيء بهويتك.",
    bodyEn: "The App has no sign-in and no user account. Everything it stores about you — bookmarks, notes, memorisation progress, and your Hifz streak — stays on your device. Nothing is synced to a server and nothing is tied to your identity.",
  },
  {
    headingAr: "٦. الجهات الخارجية التي يتصل بها التطبيق",
    headingEn: "6. Third parties the App connects to",
    bodyAr: "Quran Foundation — النص القرآني والتفسير والتلاوات الصوتية؛ ولا يُرسَل أي شيء يدل على هويتك.\nCloudflare — تستضيف وسيط الرموز الذي يحفظ بيانات اعتماد الواجهة البرمجية خارج التطبيق؛ ويستقبل بيانات الاتصال المعتادة مثل عنوان IP، ولا يمر عبره أي من محتواك.\nDeepgram — التعرّف على الكلام في وضع التلاوة؛ ويستقبل صوت الميكروفون المباشر أثناء تشغيل وضع التلاوة فقط.\njsDelivr — خطوط المصحف.\nوجميع الاتصالات تجري عبر نقل مُشفَّر (HTTPS/WSS). ولكل جهة سياسة خصوصية خاصة بها، ولا يصل أي منها إلى ملاحظاتك أو مواضعك المحفوظة أو بيانات حفظك لأنها لا تغادر جهازك.",
    bodyEn: "Quran Foundation — Quran text, tafsir and recitation audio; nothing identifying you is sent.\nCloudflare — hosts our token broker, which keeps API credentials out of the App; receives standard connection metadata such as your IP address. None of your content passes through it.\nDeepgram — speech recognition for Recite Mode; receives live microphone audio only while Recite Mode is running.\njsDelivr — mushaf fonts.\nAll connections use encrypted transport (HTTPS/WSS). Each operates under its own privacy policy, and none of them can reach your notes, bookmarks or memorisation data, because that never leaves your device.",
  },
  {
    headingAr: "٧. نقل البيانات دوليًا",
    headingEn: "7. International data transfers",
    bodyAr: "تقع Deepgram وCloudflare في الولايات المتحدة، لذا إذا استخدمت وضع التلاوة خارجها فسيُعالَج صوتك هناك. والضمانات المطبَّقة: ينتقل الصوت عبر اتصال مُشفَّر فقط، ويُنسخ نصيًا في حينه دون أن نحتفظ به، ولا يُربط بأي حساب أو هوية لعدم وجودها في التطبيق أصلًا.",
    bodyEn: "Deepgram and Cloudflare are based in the United States, so if you use Recite Mode elsewhere your audio is processed there. The safeguards: audio travels only over an encrypted connection, is transcribed in the moment and never stored by us, and is never linked to an account or identity because the App has none.",
  },
  {
    headingAr: "٨. ما لا يفعله التطبيق",
    headingEn: "8. What the App does not do",
    bodyAr: "لا إعلانات ولا معرّفات إعلانية. لا تحليلات ولا تتبّع سلوكي. لا بيع أو مشاركة للبيانات الشخصية. لا وصول إلى موقعك أو جهات اتصالك أو صورك أو ملفاتك أو سجل مكالماتك.",
    bodyEn: "No advertising and no advertising identifiers. No analytics or behavioural tracking. No selling or sharing of personal data. No access to your location, contacts, photos, files, or call history.",
  },
  {
    headingAr: "٩. الأمان",
    headingEn: "9. Security",
    bodyAr: "تجري كل الاتصالات عبر TLS مُشفَّر (HTTPS للواجهات والخطوط، وWSS لبثّ صوت وضع التلاوة)، ولا يُجري التطبيق أي اتصال غير مُشفَّر.\nوتُحفظ ملاحظاتك ومواضعك وسلاسل مواظبتك والمحتوى المُخزَّن في مساحة التطبيق الخاصة التي يعزلها أندرويد ويُشفّرها على مستوى النظام. ولا نُشغّل أي قاعدة بيانات للمستخدمين، فلا توجد نسخة على خادم تحتاج إلى حماية.\nولا تُضمَّن مفاتيح الواجهات البرمجية داخل حزمة التطبيق، بل تُحفظ كأسرار مُشفَّرة في وسيط الرموز الذي يُصدر رموزًا قصيرة الأجل فقط، وتُدوَّر هذه الأسرار عند الاشتباه في أي تسريب.\nوسيُبلَّغ عن أي وصول غير مصرّح به أو اختراق أو تسريب فعلي أو مشتبه به يتعلق بواجهات Quran Foundation إلى المؤسسة خلال ٢٤ ساعة من اكتشافه.",
    bodyEn: "All connections use TLS (HTTPS for API and font requests, WSS for the Recite Mode audio stream); the App makes no unencrypted network calls.\nYour notes, bookmarks, streaks and cached content live in the App's private storage area, which Android isolates from other apps and encrypts at the OS level. We run no user database, so there is no server-side copy to protect.\nAPI keys are never bundled into the App package — they are held as encrypted secrets in the token broker, which returns only short-lived tokens, and they are rotated whenever a compromise is suspected.\nAny actual or suspected unauthorised access, breach or data exposure involving the Quran Foundation APIs will be reported to the Foundation within 24 hours of discovery.",
  },
  {
    headingAr: "١٠. النسخ الاحتياطي لبياناتك",
    headingEn: "10. Backing up your data",
    bodyAr: "لعدم وجود حساب، فإن الحساب ← النسخ الاحتياطي ← \"تصدير بياناتي\" يكتب ملاحظاتك ومواضعك المحفوظة وسلاسل مواظبتك في ملف تتحكم أنت به. ويمكنك استعادته على جهاز آخر لنقل بياناتك. ويبقى الملف حيث حفظته — فالتطبيق لا يرفعه إلى أي مكان.",
    bodyEn: "Because there is no account, Account → Backup → \"Export My Data\" writes your notes, bookmarks and streaks to a file you control. Restore it on another device to move your data across. The file stays wherever you save it — the App never uploads it anywhere.",
  },
  {
    headingAr: "١١. الوصول إلى بياناتك وتصحيحها وحذفها",
    headingEn: "11. Accessing, correcting and deleting your data",
    bodyAr: "كل ما يحفظه التطبيق عنك موجود على جهازك وظاهر داخل التطبيق: يمكنك قراءة ملاحظاتك ومواضعك المحفوظة وتقدّم حفظك وسلاسل مواظبتك وتعديلها أو حذفها فرديًا في أي وقت، كما يمنحك \"تصدير بياناتي\" نسخة كاملة منها في ملف.\nوللحذف: ألغِ تثبيت التطبيق، أو امسح مساحة تخزينه من الإعدادات ← التطبيقات ← رفيق ← التخزين. والحذف فوري ونهائي، إذ لا توجد نسخة على الخادم ولا حاجة إلى طلب يُرسل إلينا.\nولا يتضمن رفيق تسجيل دخول ولا يستخدم حسابات مستخدمي مؤسسة القرآن ولا يطلب منك أي إذن OAuth، فلا يوجد تفويض تُلغيه ولا حساب مرتبط. ولا نُشغّل قاعدة بيانات للمستخدمين ولا نحتفظ بنسخة من محتواك على أي خادم أو في أي نسخة احتياطية لدينا. ولو أُضيف نظام حسابات مستقبلًا، فسنحذف البيانات نهائيًا خلال ٣٠ يومًا من الطلب ومن النسخ الاحتياطية خلال ٩٠ يومًا.",
    bodyEn: "Everything the App holds about you is on your device and visible in the App: your notes, bookmarks, memorisation progress and streaks can be read, edited or removed individually at any time, and \"Export My Data\" gives you the whole set as a file.\nTo delete: uninstall the App, or clear its storage from Android Settings → Apps → Rafeeq → Storage. Deletion is immediate and permanent — there is no server-side copy and no request to us is needed.\nRafeeq has no sign-in, does not use Quran Foundation user accounts and requests no OAuth permission, so there is no authorisation to revoke and no linked account. We run no user database and hold no copy of your content on any server or in any backup of ours. If an account system were ever added, deletion requests would be honoured within 30 days, and purged from backups within 90 days.",
  },
  {
    headingAr: "١٢. خصوصية الأطفال",
    headingEn: "12. Children's Privacy",
    bodyAr: "التطبيق مناسب لجميع الأعمار، ولا يجمع عن علم أي معلومات شخصية من الأطفال دون سن الثالثة عشرة. ويتطلب وضع التلاوة إذن الميكروفون، وهو إذن يمنحه مالك الجهاز في معظم الأجهزة.",
    bodyEn: "The App is suitable for all ages and does not knowingly collect personal information from children under 13. Recite Mode requires microphone permission, which on most devices must be granted by the device owner.",
  },
  {
    headingAr: "١٣. التغييرات",
    headingEn: "13. Changes",
    bodyAr: "إذا طرأ تغيير جوهري على هذه السياسة — ولا سيما فيما يخص البيانات التي تغادر جهازك — فسيتغير التاريخ أعلاه، وسيُوضَّح التغيير في ملاحظات الإصدار على صفحة المتجر. وإذا كان التغيير يشمل جمع معلومات دينية حسّاسة أو إرسالها، فسنطلب موافقتك الصريحة قبل سريانه بدل الاكتفاء باستمرارك في استخدام التطبيق.",
    bodyEn: "If this policy changes materially — particularly regarding what data leaves your device — the date above will change and the change will be described in the store listing's release notes. Where a change would involve newly collecting or transmitting sensitive religious information, we will ask for your explicit consent before it takes effect rather than relying on your continued use of the App.",
  },
  {
    headingAr: "التواصل",
    headingEn: "Contact",
    bodyAr: "لأي أسئلة أو طلبات أو شكاوى تتعلق بالخصوصية، يرجى التواصل معنا على or.mokhtar@gmail.com. ونسعى للرد على أي طلب يخص الخصوصية خلال ٣٠ يومًا من استلامه.",
    bodyEn: "For questions, privacy requests or complaints about this policy, contact us at or.mokhtar@gmail.com. We aim to respond to any privacy request within 30 days of receiving it.",
  },
];

const TERMS_SECTIONS: ProseSection[] = [
  {
    headingAr: null,
    headingEn: null,
    bodyAr: "مرحبًا بك في تطبيق رفيق (\"التطبيق\"). باستخدامك التطبيق فإنك توافق على هذه الشروط.",
    bodyEn: "Welcome to Rafeeq (\"the App\"). By using the App, you agree to these terms.",
  },
  {
    headingAr: "١. الاستخدام",
    headingEn: "1. Usage",
    bodyAr: "رفيق تطبيق مرافق للقرآن الكريم، مُصمَّم للقراءة والتلاوة والتعلّم. ويجوز لك استخدامه للأغراض الشخصية غير التجارية فقط.",
    bodyEn: "Rafeeq is a Quran companion designed for reading, recitation, and learning. You may use the App for personal, non‑commercial purposes only.",
  },
  {
    headingAr: "٢. الاستقلال عن مؤسسة القرآن",
    headingEn: "2. Independence from the Quran Foundation",
    bodyAr: "رفيق تطبيق مستقل يستخدم واجهات Quran Foundation البرمجية ويعرض النص القرآني والتفسير والتلاوات من Quran.com. وهو ليس تطبيقًا رسميًا لمؤسسة القرآن، ولا يتبعها ولا تعتمده ولا تُشغّله. ويرجى توجيه الأسئلة المتعلقة بالتطبيق إلى عنوان التواصل أدناه لا إلى المؤسسة.",
    bodyEn: "Rafeeq is an independent application. It uses the Quran Foundation APIs and displays Quran text, tafsir and recitation audio from Quran.com. It is not an official Quran Foundation application, and is not endorsed by, affiliated with or operated by the Foundation. Please direct questions about this App to the contact address below rather than to the Foundation.",
  },
  {
    headingAr: "٣. الخصوصية والبيانات",
    headingEn: "3. Privacy & Data",
    bodyAr: "يحفظ التطبيق تفضيلاتك ومواضعك المحفوظة وملاحظاتك وسلاسل مواظبتك وتقدّم تلاوتك محليًا على جهازك. ولا يوجد حساب ولا مزامنة مع خادم. ولا تُباع أي بيانات شخصية ولا تُشارك مع أطراف أخرى.",
    bodyEn: "The App stores your preferences, bookmarks, notes, streaks, and recitation progress locally on your device. There is no account and no server-side sync. No personal data is sold or shared with third parties.",
  },
  {
    headingAr: "٤. المحتوى القرآني والملكية الفكرية",
    headingEn: "4. Quran content and intellectual property",
    bodyAr: "النص القرآني والخطوط والتفسير والتلاوات الصوتية مُقدَّمة من Quran Foundation والمساهمين فيها بموجب التراخيص الخاصة بها، وتبقى ملكًا لأصحابها. أما التطبيق نفسه وشيفرته الأصلية فهي ملك للمطوِّر.\nولا يُعدَّل النص القرآني أبدًا، بل يُعرض كما تُورده واجهات المؤسسة دون أي تغيير أو اختصار.\nولا يجوز استخراج المحتوى القرآني أو بيانات الواجهة البرمجية أو نسخها أو إعادة نشرها أو بيعها أو إتاحتها خارج التطبيق. والمحتوى مُتاح لاستخدامك الشخصي في القراءة والحفظ والدراسة فقط.\nويظل المحتوى المُخزَّن على جهازك للقراءة دون اتصال خاضعًا لهذه الشروط ولشروط مؤسسة القرآن.\nأما ما تكتبه أنت من ملاحظات وتأمّلات فيبقى ملكك، ويحفظه التطبيق على جهازك فقط دون أن يدّعي أي حق فيه.",
    bodyEn: "Quran text, fonts, tafsir and audio are provided by the Quran Foundation and its contributors under their respective licenses and remain the property of their owners. The App itself and its original code are owned by the developer.\nThe Quran text is never modified — it is displayed exactly as delivered by the Quran Foundation APIs, with no alteration or abridgement.\nYou may not extract, copy, redistribute, republish, sell or otherwise make available the Quran content or raw API data outside the App experience. Content is provided for your own reading, memorisation and study only.\nContent cached on your device for offline reading remains subject to these terms and to the Quran Foundation's terms.\nYour own notes and reflections remain yours; the App stores them only on your device and makes no claim to them.",
  },
  {
    headingAr: "٥. الاستخدام المقبول",
    headingEn: "5. Acceptable use",
    bodyAr: "يرجى عدم محاولة الهندسة العكسية للتطبيق أو استخراج بيانات اعتماد الواجهة البرمجية منه، أو استخدام التطبيق أو نقاط اتصاله لجلب المحتوى القرآني بالجملة لتطبيق آخر، أو التشويش على خدمات التطبيق أو واجهات مؤسسة القرآن. وقد يُسحب الوصول عند مخالفة هذه الشروط أو شروط مطوّري المؤسسة.",
    bodyEn: "Please do not attempt to reverse-engineer the App or extract its API credentials, use the App or its endpoints to retrieve Quran content in bulk for another application, or interfere with the App's services or the Quran Foundation's APIs. Access may be withdrawn where use breaches these terms or the Quran Foundation's Developer Terms.",
  },
  {
    headingAr: "٦. إخلاء المسؤولية",
    headingEn: "6. Disclaimer",
    bodyAr: "يُقدَّم التطبيق \"كما هو\" دون أي ضمانات. والمطوِّر غير مسؤول عن أي أخطاء في المحتوى أو في أداء التطبيق. ومع أن النص القرآني يُعرض كما يَرد من مؤسسة القرآن دون تعديل، يُرجى الرجوع إلى مصحف مطبوع أو إلى أهل العلم عند الحاجة إلى اليقين.",
    bodyEn: "The App is provided \"as is\" without warranties. The developer is not responsible for any errors in content or functionality. While Quran text is displayed exactly as received from the Quran Foundation and is never altered by the App, please consult a printed mushaf or a qualified scholar where certainty matters.",
  },
  {
    headingAr: "٧. التغييرات",
    headingEn: "7. Changes",
    bodyAr: "قد نُحدِّث هذه الشروط. واستمرارك في الاستخدام بعد التغيير يعني قبولك الشروط الجديدة.",
    bodyEn: "We may update these terms. Continued use after changes means you accept the new terms.",
  },
  {
    headingAr: "التواصل",
    headingEn: "Contact",
    bodyAr: "or.mokhtar@gmail.com",
    bodyEn: "or.mokhtar@gmail.com",
  },
];

/** "Last updated" date, per language — same day, localised month name. */
const LEGAL_UPDATED_AR = "١٤ أغسطس ٢٠٢٦";
const LEGAL_UPDATED_EN = "14 August 2026";

const Account: React.FC = () => {
  const history = useHistory();
  const { lang, isRTL } = useLang();

  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<ModalType>(null);
  const [featureText, setFeatureText] = useState("");
  const [featureSent, setFeatureSent] = useState(false);
  const featureRef = useRef<HTMLTextAreaElement>(null);

  // The streak panel derives everything else from the plan's sessions; this
  // page only has to load the plan. All local — no account, no network.
  const [sessions, setSessions] = useState<PlanSession[]>([]);

  const [notes, setNotes] = useState<Note[]>([]);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  // Backup & restore
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [pendingRestore, setPendingRestore] = useState<
    { summary: BackupSummary; json: string } | null
  >(null);
  const [restoring, setRestoring] = useState(false);

  const loadLocalData = useCallback(async () => {
    setLoading(true);
    setNotesError(null);
    try {
      // The Hifz streak merges the persistent active-day store with the current
      // plan's completed sessions, so the plan has to be loaded to compute it.
      const plan = await loadPlanAsync();
      const planSessions: PlanSession[] = plan?.sessions ?? [];

      // Cover any missed days with a freeze before computing, so simply
      // opening this page after a lapse shows the streak intact rather than
      // broken. Idempotent, and a no-op when nothing was missed. Settled only
      // once the plan has loaded, or an empty session list would make the last
      // active day look older than it is.
      settleHifzFreezes(planSessions);

      setSessions(planSessions);
      setNotes(await fetchAllNotes());
    } catch (err) {
      console.error("[Account] loadLocalData failed:", err);
      setNotesError(
        lang === "ar" ? "تعذر تحميل الملاحظات" : "Could not load notes",
      );
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    loadLocalData();
  }, [loadLocalData]);

  // Refresh when returning to the page — a Hifz session finished elsewhere
  // will have moved the streak.
  useIonViewWillEnter(() => {
    loadLocalData();
  });

  const handleExport = useCallback(async () => {
    setBackupError(null);
    setBackupMsg(null);
    try {
      const fileName = await exportBackupToFile();
      setBackupMsg(
        lang === "ar"
          ? `تم حفظ النسخة الاحتياطية: ${fileName}`
          : `Backup saved: ${fileName}`,
      );
    } catch (err) {
      console.error("[Account] export failed:", err);
      setBackupError(
        lang === "ar" ? "تعذر إنشاء النسخة الاحتياطية" : "Could not create the backup",
      );
    }
  }, [lang]);

  // Reading the file only previews it — nothing is written until the user
  // confirms in the restore dialog, since restoring replaces existing data.
  const handleFilePicked = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Allow re-picking the same file later.
      e.target.value = "";
      if (!file) return;

      setBackupError(null);
      setBackupMsg(null);
      try {
        const json = await readBackupFile(file);
        const backup = parseBackup(json);
        setPendingRestore({ summary: summarizeBackup(backup), json });
        setModal("restore");
      } catch (err) {
        const code = err instanceof BackupError ? err.message : "unknown";
        setBackupError(
          code === "version_too_new"
            ? lang === "ar"
              ? "هذه النسخة أُنشئت بإصدار أحدث من التطبيق"
              : "This backup was made by a newer version of the app"
            : lang === "ar"
              ? "هذا الملف ليس نسخة احتياطية صالحة"
              : "That file is not a valid Rafeeq backup",
        );
      }
    },
    [lang],
  );

  const handleConfirmRestore = useCallback(async () => {
    if (!pendingRestore) return;
    setRestoring(true);
    setBackupError(null);
    try {
      await restoreBackup(parseBackup(pendingRestore.json));
      setModal(null);
      setPendingRestore(null);
      await loadLocalData();
      // Nudge any other mounted view that reads these stores directly.
      window.dispatchEvent(new CustomEvent("hifz-streak-changed"));
      setBackupMsg(
        lang === "ar" ? "تمت استعادة بياناتك" : "Your data has been restored",
      );
    } catch (err) {
      console.error("[Account] restore failed:", err);
      setBackupError(
        lang === "ar" ? "تعذرت استعادة النسخة الاحتياطية" : "Could not restore the backup",
      );
      setModal(null);
    } finally {
      setRestoring(false);
    }
  }, [pendingRestore, lang, loadLocalData]);

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString(
        lang === "ar" ? "ar-SA" : "en-GB",
        { year: "numeric", month: "short", day: "numeric" },
      );
    } catch {
      return iso;
    }
  };

  const t = {
    title:          lang === "ar" ? "حسابي"                              : "My Account",
    subtitle:       lang === "ar" ? "الإحصاءات والإنجازات"               : "Stats & Achievements",
    back:           lang === "ar" ? "رجوع"                               : "Back",
    streak:         lang === "ar" ? "سلسلة الحفظ"                        : "Streak",
    hifzStreak:     lang === "ar" ? "سلسلة الحفظ"                        : "Hifz Streak",
    days:           lang === "ar" ? "يوم"                                : "days",
    loading:        lang === "ar" ? "جاري التحميل…"                      : "Loading…",
    aboutApp:       lang === "ar" ? "عن التطبيق"                         : "About Rafeeq",
    backup:         lang === "ar" ? "النسخ الاحتياطي"                    : "Backup",
    exportData:     lang === "ar" ? "تصدير بياناتي"                      : "Export My Data",
    importData:     lang === "ar" ? "استعادة من ملف"                     : "Restore From File",
    backupHint:     lang === "ar"
      ? "احفظ ملاحظاتك وسلاسلك ومواضع القراءة في ملف، ثم استعدها على جهاز آخر."
      : "Save your notes, streaks and bookmarks to a file, then restore them on another device.",
    restoreTitle:   lang === "ar" ? "استعادة البيانات"                   : "Restore Data",
    restoreWarn:    lang === "ar"
      ? "سيحل محتوى هذا الملف محل البيانات الموجودة على هذا الجهاز. لا يمكن التراجع عن هذا الإجراء."
      : "This will replace the data currently on this device. This cannot be undone.",
    restoreConfirm: lang === "ar" ? "استعادة"                            : "Restore",
    restoring:      lang === "ar" ? "جاري الاستعادة…"                    : "Restoring…",
    cancel:         lang === "ar" ? "إلغاء"                              : "Cancel",
    requestFeature: lang === "ar" ? "اقتراح ميزة"                        : "Request a Feature",
    helpCenter:     lang === "ar" ? "مركز المساعدة"                      : "Help Center",
    shareApp:       lang === "ar" ? "مشاركة التطبيق"                     : "Share Application",
    rateApp:        lang === "ar" ? "تقييم التطبيق"                      : "Rate Application",
    comingSoon:     lang === "ar" ? "قريباً"                             : "Coming soon",
    terms:          lang === "ar" ? "شروط الخدمة"                        : "Terms of Service",
    privacy:        lang === "ar" ? "سياسة الخصوصية"                     : "Privacy Policy",
    retry:          lang === "ar" ? "حاول مجدداً"                        : "Try again",
    notes:          lang === "ar" ? "ملاحظاتي"                           : "My Notes",
    noNotes:        lang === "ar" ? "لا توجد ملاحظات بعد"                : "No notes yet",
    noteVerse:      lang === "ar" ? "الآية"                              : "Verse",
    send:           lang === "ar" ? "إرسال"                              : "Send",
    sent:           lang === "ar" ? "تم الإرسال!"                        : "Sent!",
    featurePlaceholder: lang === "ar"
      ? "صف الميزة التي تودّ إضافتها…"
      : "Describe the feature you'd like to see…",
    featureHint: lang === "ar"
      ? "اكتب اقتراحك وسنأخذه بعين الاعتبار."
      : "Write your suggestion and we'll take it into consideration.",
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch {
      setNotesError(lang === "ar" ? "تعذر حذف الملاحظة" : "Could not delete note");
    }
  };

  const handleFeatureSubmit = () => {
    if (!featureText.trim()) return;
    const subject = encodeURIComponent("Rafeeq Feature Request");
    const body = encodeURIComponent(featureText.trim());
    window.open(`mailto:or.mokhtar@gmail.com?subject=${subject}&body=${body}`, "_blank");
    setFeatureSent(true);
    setFeatureText("");
    setTimeout(() => { setFeatureSent(false); setModal(null); }, 1800);
  };

  const ProseContent: React.FC<{ sections: ProseSection[] }> = ({ sections }) => {
    const isAr = lang === "ar";
    return (
      <div className="amod-prose">
        <p className="amod-updated">
          {isAr
            ? `آخر تحديث: ${LEGAL_UPDATED_AR}`
            : `Last updated: ${LEGAL_UPDATED_EN}`}
        </p>
        {sections.map((s, i) => {
          const heading = isAr ? s.headingAr : s.headingEn;
          const body = isAr ? s.bodyAr : s.bodyEn;
          return (
            <React.Fragment key={i}>
              {heading && <h2>{heading}</h2>}
              {body.split("\n").map((line, j) => <p key={j}>{line}</p>)}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="account-page" dir={isRTL ? "rtl" : "ltr"}>

          <div className="account-body">

            {/* ── Streak card — Hifz sessions, computed locally ── */}
            <div className="ac-card ac-streak-card">
              {/* Always open: the streak is the reason to visit this tab, and
                  the stats below already carry what a collapsed summary would
                  have said. */}
              <div className="ac-streak-header ac-streak-header--static">
                <div className="ac-streak-header-left">
                  <span className="ac-streak-flame">🍃</span>
                  <p className="ac-streak-title">{t.streak}</p>
                </div>
              </div>

              <div className="ac-streak-body">
                {loading ? (
                  <div className="ac-loading"><div className="ac-spinner" /><span>{t.loading}</span></div>
                ) : (
                  <StreakPanel sessions={sessions} lang={lang} />
                )}
              </div>
            </div>

            {/* ── Notes card ── */}
            <div className="ac-card ac-notes-card">
                <button
                  className="ac-streak-header"
                  onClick={() => setNotesOpen((o) => !o)}
                  aria-expanded={notesOpen}
                >
                  <div className="ac-streak-header-left">
                    <span className="ac-streak-flame">📝</span>
                    <div>
                      <p className="ac-streak-title">{t.notes}</p>
                      {!notesOpen && !loading && (
                        <p className="ac-streak-summary">
                          {notes.length > 0
                            ? `${notes.length} ${lang === "ar" ? "ملاحظة" : notes.length === 1 ? "note" : "notes"}`
                            : t.noNotes}
                        </p>
                      )}
                    </div>
                  </div>
                  <svg className={`ac-chevron ${notesOpen ? "ac-chevron-up" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>

                {notesOpen && (
                  <div className="ac-streak-body">
                    {loading ? (
                      <div className="ac-loading"><div className="ac-spinner" /><span>{t.loading}</span></div>
                    ) : notesError ? (
                      <div className="ac-error-block">
                        <p className="ac-error">{notesError}</p>
                        <button className="ac-retry-btn" onClick={() => loadLocalData()}>{t.retry}</button>
                      </div>
                    ) : notes.length === 0 ? (
                      <p className="ac-streak-empty">{t.noNotes}</p>
                    ) : (
                      <ul className="ac-notes-list">
                        {notes.map((note) => (
                          <li key={note.id} className="ac-note-row">
                            <div className="ac-note-row-info">
                              <span className="ac-note-row-verse">
                                {t.noteVerse} {note.ranges?.[0] ?? ""}
                              </span>
                              <p className="ac-note-row-body">{note.body}</p>
                              <span className="ac-note-row-date">
                                {formatDate(note.updatedAt || note.createdAt)}
                              </span>
                            </div>
                            <button
                              className="ac-note-delete-btn"
                              onClick={() => handleDeleteNote(note.id)}
                              aria-label={lang === "ar" ? "حذف الملاحظة" : "Delete note"}
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                <path d="M10 11v6M14 11v6" />
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                              </svg>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
            </div>

            {/* ── Info group ── */}
            <p className="ac-section-label">{lang === "ar" ? "معلومات" : "Info"}</p>
            <div className="ac-group">
              <button className="ac-row" onClick={() => setModal("about")}>
                <span className="ac-row-label">{t.aboutApp}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" onClick={() => { setFeatureSent(false); setModal("request"); setTimeout(() => featureRef.current?.focus(), 120); }}>
                <span className="ac-row-label">{t.requestFeature}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" onClick={() => window.open("mailto:or.mokhtar@gmail.com", "_blank")}>
                <span className="ac-row-label">{t.helpCenter}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </button>
            </div>

            {/* ── Backup group — the cross-device path, since there is no account ── */}
            <p className="ac-section-label">{t.backup}</p>
            <p className="ac-group-hint">{t.backupHint}</p>
            <div className="ac-group">
              <button className="ac-row" onClick={handleExport}>
                <span className="ac-row-label">{t.exportData}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" onClick={() => fileInputRef.current?.click()}>
                <span className="ac-row-label">{t.importData}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
            </div>
            {backupMsg && <p className="ac-backup-msg" role="status">{backupMsg}</p>}
            {backupError && <p className="ac-backup-msg ac-backup-msg--error" role="alert">{backupError}</p>}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFilePicked}
              style={{ display: "none" }}
            />

            {/* ── Share / Rate group — disabled until the app is published to the stores ── */}
            <p className="ac-section-label">{lang === "ar" ? "مشاركة" : "Share"}</p>
            <div className="ac-group ac-group-disabled">
              <span className="ac-soon-pill">{t.comingSoon}</span>
              <button className="ac-row" disabled aria-disabled>
                <span className="ac-row-label">{t.shareApp}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" disabled aria-disabled>
                <span className="ac-row-label">{t.rateApp}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </button>
            </div>

            {/* ── Legal group ── */}
            <p className="ac-section-label">{lang === "ar" ? "قانوني" : "Legal"}</p>
            <div className="ac-group">
              <button className="ac-row" onClick={() => setModal("terms")}>
                <span className="ac-row-label">{t.terms}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {isRTL ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
                </svg>
              </button>
              <div className="ac-row-divider" />
              <button className="ac-row" onClick={() => setModal("privacy")}>
                <span className="ac-row-label">{t.privacy}</span>
                <svg className="ac-row-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {isRTL ? <path d="M15 18l-6-6 6-6" /> : <path d="M9 18l6-6-6-6" />}
                </svg>
              </button>
            </div>

            <div className="ac-bottom-spacer" />
          </div>

        </div>

        {/* ── Modals ── */}
        {/* The freeze sheet is not here: StreakPanel owns it, so both this
            page and the Hifz sheet get it without either mounting it. */}

        {modal === "about" && (
          <AccountModal title={t.aboutApp} onClose={() => setModal(null)}>
            <div className="amod-about">
              <div className="amod-about-logo">📖</div>
              <p className="amod-about-name">Rafeeq</p>
              <p className="amod-about-tagline">
                {lang === "ar"
                  ? "رفيقك في رحلة قراءة القرآن الكريم — مصحف، تلاوة، وإحصاءات."
                  : "Your Quran companion — read, listen, and track your journey."}
              </p>
              <p className="amod-about-version">Version 1.0.0</p>
              <div className="amod-about-divider" />
              <div className="amod-about-row">
                <span className="amod-about-row-label">{lang === "ar" ? "المطوّر" : "Developer"}</span>
                <span className="amod-about-row-val">Omar Mokhtar</span>
              </div>
              <div className="amod-about-row">
                <span className="amod-about-row-label">{lang === "ar" ? "المحتوى" : "Content"}</span>
                <span className="amod-about-row-val">Quran Foundation</span>
              </div>
              <div className="amod-about-row">
                <span className="amod-about-row-label">{lang === "ar" ? "آخر تحديث" : "Last updated"}</span>
                <span className="amod-about-row-val">May 2026</span>
              </div>
            </div>
          </AccountModal>
        )}

        {modal === "request" && (
          <AccountModal title={t.requestFeature} onClose={() => setModal(null)}>
            <div className="amod-request">
              <p className="amod-request-label">{t.featureHint}</p>
              <textarea
                ref={featureRef}
                className="amod-request-textarea"
                placeholder={t.featurePlaceholder}
                value={featureText}
                onChange={(e) => setFeatureText(e.target.value)}
                dir={isRTL ? "rtl" : "ltr"}
              />
              <button
                className="amod-request-submit"
                onClick={handleFeatureSubmit}
                disabled={!featureText.trim() || featureSent}
              >
                {featureSent ? t.sent : t.send}
              </button>
            </div>
          </AccountModal>
        )}

        {modal === "terms" && (
          <AccountModal title={t.terms} onClose={() => setModal(null)}>
            <ProseContent sections={TERMS_SECTIONS} />
          </AccountModal>
        )}

        {modal === "privacy" && (
          <AccountModal title={t.privacy} onClose={() => setModal(null)}>
            <ProseContent sections={PRIVACY_SECTIONS} />
          </AccountModal>
        )}

        {modal === "restore" && pendingRestore && (
          <AccountModal title={t.restoreTitle} onClose={() => { setModal(null); setPendingRestore(null); }}>
            <div className="amod-request">
              <p className="amod-request-label">{t.restoreWarn}</p>
              <ul className="ac-restore-summary">
                <li>
                  <span>{t.notes}</span>
                  <strong>{pendingRestore.summary.notes}</strong>
                </li>
                <li>
                  <span>{lang === "ar" ? "المواضع المحفوظة" : "Bookmarks"}</span>
                  <strong>{pendingRestore.summary.bookmarks}</strong>
                </li>
                <li>
                  <span>{t.hifzStreak}</span>
                  <strong>{pendingRestore.summary.hifzStreakDays} {t.days}</strong>
                </li>
              </ul>
              <div className="ac-restore-actions">
                <button
                  className="ac-restore-cancel"
                  onClick={() => { setModal(null); setPendingRestore(null); }}
                  disabled={restoring}
                >
                  {t.cancel}
                </button>
                <button
                  className="amod-request-submit"
                  onClick={handleConfirmRestore}
                  disabled={restoring}
                >
                  {restoring ? t.restoring : t.restoreConfirm}
                </button>
              </div>
            </div>
          </AccountModal>
        )}

      </IonContent>
      <BottomNavBar active="account" fixed />
    </IonPage>
  );
};

export default Account;
