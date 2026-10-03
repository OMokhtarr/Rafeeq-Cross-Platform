/**
 * Every onboarding string, Arabic and English. Kept apart from strings.ts so
 * the tour copy can be read and edited as one piece; onboardingCopy.test.ts
 * checks it covers the catalog exactly.
 */
import type { Lang } from "../../core/i18n/strings";
import { toHindiNumbers } from "../../core/utils/arabic.util";
import type { TourId, WelcomeSlideId } from "./tourCatalog";

export interface StepCopy {
  title: string;
  body: string;
}

export interface OnboardingCopy {
  controls: {
    next: string;
    prev: string;
    skip: string;
    done: string;
    getStarted: string;
    showMe: string;
    whatsNew: string;
    /** The What's new heading once the installed versionName is known. */
    whatsNewIn: (version: string) => string;
    chooseLanguage: string;
    arabic: string;
    english: string;
    dialogLabel: string;
    stepOf: (n: number, total: number) => string;
  };
  slides: Record<WelcomeSlideId, StepCopy>;
  tours: Record<TourId, Record<string, StepCopy>>;
  /** Keyed by the feature's key. */
  releases: Record<string, StepCopy>;
  settings: {
    section: string;
    welcome: string;
    welcomeDesc: string;
    tips: string;
    tipsDesc: string;
    tipsDone: string;
    whatsNew: string;
    whatsNewDesc: string;
    show: string;
    replay: string;
  };
}

const ar: OnboardingCopy = {
  controls: {
    next: "التالي",
    prev: "السابق",
    skip: "تخطي",
    done: "تم",
    getStarted: "ابدأ الآن",
    showMe: "أرني",
    whatsNew: "ما الجديد",
    whatsNewIn: (version) => `الجديد في الإصدار ${toHindiNumbers(version).replace(/\./g, "٫")}`,
    chooseLanguage: "اختر اللغة",
    arabic: "العربية",
    english: "English",
    dialogLabel: "جولة تعريفية",
    stepOf: (n, total) => `الخطوة ${n} من ${total}`,
  },
  slides: {
    welcome: { title: "أهلًا بك في رفيق", body: "بسم الله الرحمن الرحيم — رفيقك اليومي مع القرآن والأذكار والصلاة." },
    read: { title: "اقرأ واستمع", body: "مصحف بألوان التجويد، وتفاسير، ونخبة من القرّاء — ويعمل دون اتصال." },
    recite: { title: "سمّع واحفظ", body: "سمّع من حفظك فتظهر الآيات كلمة بكلمة، وأخفِ الآيات لتراجع، وسِر على خطة حفظ." },
    quiz: { title: "اختبر حفظك", body: "ثلاثة اختبارات: أكمل الآية، والمتشابهات، وأكمل النهايات." },
    worship: { title: "عبادتك اليومية", body: "أذكار الصباح والمساء وغيرها مع عدّاد، ومتابع لعباداتك يومًا بيوم." },
    prayer: { title: "الصلاة والقبلة", body: "مواقيت الصلاة حسب موقعك، وبوصلة القبلة، وأداة على الشاشة الرئيسية في أندرويد." },
  },
  tours: {
    home: {
      tabs: { title: "التنقل", body: "كل أقسام التطبيق في الشريط السفلي: الرئيسية والمصحف والاختبارات والأذكار والحفظ." },
      more: { title: "المزيد", body: "مواقيت الصلاة والقبلة، ومتابع العبادات، والحساب، والإعدادات." },
    },
    viewer: {
      swipe: { title: "قلّب الصفحات", body: "اسحب يمينًا أو يسارًا للانتقال بين الصفحات." },
      pill: { title: "السور والأجزاء", body: "اضغط هنا للانتقال إلى أي سورة أو جزء أو حزب." },
      play: { title: "استمع أو سمّع", body: "اضغط للاستماع إلى التلاوة، واضغط مطوّلًا للتبديل إلى وضع التسميع." },
      hide: { title: "أخفِ للمراجعة", body: "أخفِ الآيات لتختبر حفظك، ثم اكشفها كلمة كلمة." },
      verse: { title: "خيارات الآية", body: "اضغط مطوّلًا على أي كلمة، أو على رقم الآية، للتفسير والملاحظات والعلامات." },
      nav: { title: "العلامات والبحث", body: "افتح آياتك المحفوظة، أو ابحث في نص القرآن." },
      immersive: { title: "قراءة بلا مشتّتات", body: "انقر مرتين لإخفاء الأشرطة والتركيز على الصفحة، وانقر مرتين مجددًا لإظهارها." },
    },
    "viewer.verseSheet": {
      actions: { title: "استمع ودوّن واحفظ", body: "شغّل الآية، أو أضف ملاحظة، أو ضع عليها علامة." },
      tafsir: { title: "التفسير", body: "اختر التفسير، أو نزّل تفسيرًا جديدًا من المكتبة." },
      swipe: { title: "الآية التالية", body: "اسحب على الآية للانتقال إلى الآية التالية أو السابقة." },
    },
    "viewer.playbackSheet": {
      range: { title: "حدّد المقطع", body: "اختر آية البداية وآية النهاية." },
      quick: { title: "اختيار سريع", body: "هذه الصفحة أو السورة أو الجزء أو القرآن كاملًا بنقرة واحدة." },
      reciter: { title: "القارئ", body: "اختر القارئ، ونزّل السور للاستماع دون اتصال." },
      speed: { title: "السرعة والتكرار", body: "غيّر سرعة التلاوة، وكرّر كل آية أو المقطع كله لتحفظ." },
    },
    "viewer.playbackBar": {
      controls: { title: "التحكم في التلاوة", body: "الآية السابقة والتالية، والإيقاف المؤقت، والإيقاف، وإعدادات التشغيل." },
    },
    "viewer.reciteBar": {
      transcript: { title: "ما تقرؤه", body: "يظهر هنا ما يسمعه رفيق، وتنكشف الآيات كلما قرأتها صحيحة." },
      stop: { title: "إنهاء التسميع", body: "اضغط لإيقاف الاستماع." },
    },
    "viewer.reciteReveal": {
      reveal: { title: "توقفت؟", body: "اكشف الكلمة التالية أو الآية التالية." },
    },
    "viewer.reveal": {
      word: { title: "اكشف كلمة", body: "يُظهر الكلمة التالية من الآيات المخفية." },
      verse: { title: "اكشف آية", body: "يُظهر الآية التالية كاملة." },
    },
    surahJuz: {
      tabs: { title: "تصفّح كما تحب", body: "حسب السورة، أو الجزء، أو الحزب وأرباعه." },
    },
    search: {
      input: { title: "ابحث في القرآن", body: "اكتب كلمات من الآية لتجدها في المصحف." },
      recents: { title: "عمليات البحث الأخيرة", body: "اضغط على أي بحث سابق لتعيده." },
    },
    quizList: {
      ayah: { title: "أكمل الآية", body: "تُعرض عليك بداية آية، فتكملها من حفظك." },
      mutashabihat: { title: "المتشابهات", body: "ميّز بين الآيات المتشابهة وأكمل الصحيحة منها." },
      nehayat: { title: "أكمل النهايات", body: "اختر النهاية الصحيحة للآية بعد علامة الوقف." },
    },
    quizSetup: {
      mode: { title: "بسيط أو متقدّم", body: "الوضع المتقدّم يتيح لك الجمع بين عدة نطاقات." },
      scope: { title: "النطاق", body: "اختبر نفسك في سور أو صفحات أو أجزاء." },
      count: { title: "عدد الأسئلة", body: "اختر عدد أسئلة الاختبار." },
      start: { title: "ابدأ", body: "ابدأ الاختبار متى كنت مستعدًا." },
    },
    azkar: {
      mine: { title: "أذكاري", body: "الأذكار التي تميّزها بنجمة تجتمع هنا." },
      progress: { title: "تقدّمك", body: "يظهر على كل قسم مقدار ما أتممته." },
    },
    azkarCategory: {
      counter: { title: "العدّاد", body: "اضغط مع كل تكرار حتى يكتمل العدد." },
      star: { title: "أضف إلى أذكاري", body: "ميّز الذكر بنجمة ليظهر في أذكاري." },
      swipe: { title: "ابدأ من جديد", body: "اسحب البطاقة جانبًا لتصفير عدّادها." },
      ref: { title: "المصدر", body: "اعرض مصدر هذا الذكر." },
    },
    hifzSetup: {
      add: { title: "محفوظك", body: "أضف السور أو الأجزاء أو الصفحات التي تحفظها." },
      goal: { title: "مقدار كل جلسة", body: "حدّد مقدار ما تراجعه في كل جلسة." },
      generate: { title: "أنشئ خطتك", body: "يقسّم رفيق محفوظك إلى جلسات مراجعة." },
    },
    hifzDashboard: {
      hero: { title: "اسحب للمزيد", body: "اسحب البطاقة لترى إحصاءاتك وأفضل خططك." },
      streak: { title: "أيامك المتتالية", body: "اضغط لترى سلسلة أيامك." },
      sessions: { title: "كل الجلسات", body: "اعرض جلسات خطتك وعلّم ما أنجزته." },
    },
    hifzSessions: {
      done: { title: "أنجزتها", body: "علّم الجلسة عند الانتهاء منها." },
      open: { title: "راجع واختبر", body: "افتح الجلسة في المصحف، أو اختبر نفسك فيها بعد إنجازها." },
    },
    more: {
      cards: { title: "المزيد من رفيق", body: "مواقيت الصلاة والقبلة، ومتابع العبادات، والحساب، والإعدادات." },
    },
    "prayerTimes.setup": {
      grant: { title: "موقعك", body: "اسمح بالوصول إلى موقعك لحساب مواقيت الصلاة واتجاه القبلة." },
    },
    prayerTimes: {
      next: { title: "الصلاة القادمة", body: "الوقت المتبقي حتى الصلاة القادمة." },
      qibla: { title: "القبلة", body: "أدر هاتفك حتى يشير المؤشر إلى الكعبة." },
      menu: { title: "الخيارات", body: "طريقة الحساب والمذهب، والمواقيت المعروضة، وإعدادات الأداة." },
    },
    "prayerTimes.alarms": {
      menu: { title: "منبّهات الصلاة", body: "من هنا تضبط منبّهًا قبل أي صلاة أو بعدها، يرنّ كل يوم حتى والتطبيق مغلق." },
    },
    tracker: {
      item: { title: "سجّل عبادتك", body: "اضغط على العبادة بعد أدائها." },
      locked: { title: "لم يحن وقتها", body: "تُفتح كل عبادة عند دخول وقتها." },
      shortcut: { title: "اختصار", body: "اضغط مطوّلًا على الأذكار أو ورد القرآن لتفتحها مباشرة." },
      strip: { title: "الأيام السابقة", body: "اختر يومًا من الأسبوع أو من التقويم لتراجعه أو تعدّله." },
      header: { title: "الإعدادات والمساعدة", body: "اختر ما تتابعه ووزن كل قسم، واقرأ كيف تُحسب النتيجة." },
    },
    bookmarks: {
      tabs: { title: "علاماتك", body: "الآيات المحفوظة، وجلسات الاستماع التي يمكنك استئنافها." },
    },
    settings: {
      look: { title: "اللغة والمظهر", body: "بدّل بين العربية والإنجليزية، وبين الوضع الليلي والنهاري." },
      sync: { title: "المحتوى دون اتصال", body: "يُبقي رفيق المحتوى محدّثًا، ويمكنك المزامنة الآن." },
      reminders: { title: "تذكير الصلاة", body: "تنبيه عند دخول وقت كل صلاة." },
      tours: { title: "الجولات والنصائح", body: "أعد مشاهدة شرائح الترحيب ونصائح الصفحات من هنا." },
    },
    tafsirLibrary: {
      library: { title: "مكتبة التفاسير", body: "نزّل تفسيرًا لتقرأه دون اتصال." },
      downloaded: { title: "تفاسيرك", body: "التفاسير المنزّلة، احذفها أو أعد تنزيلها من هنا." },
    },
    account: {
      notes: { title: "ملاحظاتك", body: "كل ملاحظاتك على الآيات في مكان واحد." },
      backup: { title: "النسخ الاحتياطي", body: "صدّر بياناتك واستعدها على جهاز آخر." },
      streak: { title: "احمِ سلسلتك", body: "استخدم التجميد لتحافظ على سلسلتك في يوم يفوتك." },
    },
  },
  releases: {
    prayerAlarms: {
      title: "منبّهات الصلاة",
      body: "اضبط منبّهات ترنّ قبل الصلاة أو بعدها، كالسحور قبل الفجر، وتتبع المواقيت كل يوم. يمكن تخصيصها لأيام معيّنة أو لرمضان فقط.",
    },
  },
  settings: {
    section: "الجولات والنصائح",
    welcome: "شرائح الترحيب",
    welcomeDesc: "شاهد التعريف بالتطبيق من جديد",
    tips: "نصائح الصفحات",
    tipsDesc: "أعد عرض النصائح عند زيارة كل صفحة",
    tipsDone: "ستظهر النصائح مجددًا عند زيارة كل صفحة.",
    whatsNew: "ما الجديد",
    whatsNewDesc: "آخر الميزات المضافة",
    show: "عرض",
    replay: "إعادة",
  },
};

const en: OnboardingCopy = {
  controls: {
    next: "Next",
    prev: "Previous",
    skip: "Skip",
    done: "Done",
    getStarted: "Get started",
    showMe: "Show me",
    whatsNew: "What's new",
    whatsNewIn: (version) => `What's new in ${version}`,
    chooseLanguage: "Choose your language",
    arabic: "العربية",
    english: "English",
    dialogLabel: "Guided tour",
    stepOf: (n, total) => `Step ${n} of ${total}`,
  },
  slides: {
    welcome: { title: "Welcome to Rafeeq", body: "In the name of Allah — your daily companion for the Quran, azkar and prayer." },
    read: { title: "Read & listen", body: "A Tajweed-coloured mushaf, tafsir and a choice of reciters — all working offline." },
    recite: { title: "Recite & memorize", body: "Recite from memory and the verses appear word by word. Hide verses to revise, and follow a Hifz plan." },
    quiz: { title: "Test yourself", body: "Three quizzes: Complete the Verse, Similar Verses and Verse Endings." },
    worship: { title: "Daily worship", body: "Morning, evening and other azkar with a counter, plus a tracker for your daily worship." },
    prayer: { title: "Prayer & Qibla", body: "Prayer times for your location, a Qibla compass and a home-screen widget on Android." },
  },
  tours: {
    home: {
      tabs: { title: "Getting around", body: "Every section is one tap away in the bar below: Home, Quran, Quiz, Azkar and Hifz." },
      more: { title: "More", body: "Prayer times & Qibla, the Worship Tracker, your account and settings." },
    },
    viewer: {
      swipe: { title: "Turn pages", body: "Swipe left or right to move between pages." },
      pill: { title: "Surahs & juz", body: "Tap to jump to any surah, juz or hizb." },
      play: { title: "Listen or recite", body: "Tap to listen. Long-press to switch to recite mode." },
      hide: { title: "Hide to revise", body: "Hide the verses to test your memory, then reveal them word by word." },
      verse: { title: "Verse options", body: "Long-press any word, or tap a verse number, for tafsir, notes and bookmarks." },
      nav: { title: "Bookmarks & search", body: "Open your saved verses, or search the Quran text." },
      immersive: { title: "Distraction-free", body: "Double-tap to hide the bars and focus on the page. Double-tap again to bring them back." },
    },
    "viewer.verseSheet": {
      actions: { title: "Play, note, bookmark", body: "Play this verse, add a note, or bookmark it." },
      tafsir: { title: "Tafsir", body: "Pick a tafsir, or download one from the library." },
      swipe: { title: "Next verse", body: "Swipe the verse to move to the next or previous one." },
    },
    "viewer.playbackSheet": {
      range: { title: "Choose a range", body: "Pick the first and last verse." },
      quick: { title: "Quick select", body: "This page, surah, juz or the whole Quran in one tap." },
      reciter: { title: "Reciter", body: "Choose a reciter and download surahs to listen offline." },
      speed: { title: "Speed & repeat", body: "Change the speed, and repeat each verse or the whole range to memorize." },
    },
    "viewer.playbackBar": {
      controls: { title: "Playback controls", body: "Previous and next verse, pause, stop, and playback settings." },
    },
    "viewer.reciteBar": {
      transcript: { title: "What you recite", body: "What Rafeeq hears shows here, and verses appear as you recite them correctly." },
      stop: { title: "Stop reciting", body: "Tap to stop listening." },
    },
    "viewer.reciteReveal": {
      reveal: { title: "Stuck?", body: "Reveal the next word or the next verse." },
    },
    "viewer.reveal": {
      word: { title: "Reveal a word", body: "Shows the next hidden word." },
      verse: { title: "Reveal a verse", body: "Shows the whole next verse." },
    },
    surahJuz: {
      tabs: { title: "Browse your way", body: "By surah, by juz, or by hizb and its quarters." },
    },
    search: {
      input: { title: "Search the Quran", body: "Type words from a verse to find it in the mushaf." },
      recents: { title: "Recent searches", body: "Tap a previous search to run it again." },
    },
    quizList: {
      ayah: { title: "Complete the Verse", body: "You see the start of a verse and finish it from memory." },
      mutashabihat: { title: "Similar Verses", body: "Tell similar verses apart and complete the right one." },
      nehayat: { title: "Verse Endings", body: "Pick the correct ending of a verse after the pause mark." },
    },
    quizSetup: {
      mode: { title: "Simple or advanced", body: "Advanced lets you combine several ranges." },
      scope: { title: "Scope", body: "Test yourself on surahs, pages or juz." },
      count: { title: "Questions", body: "Choose how many questions to answer." },
      start: { title: "Start", body: "Start the quiz when you're ready." },
    },
    azkar: {
      mine: { title: "My Azkar", body: "Azkar you star are collected here." },
      progress: { title: "Your progress", body: "Each category shows how much you've completed." },
    },
    azkarCategory: {
      counter: { title: "Counter", body: "Tap once for each repetition until the count is complete." },
      star: { title: "Add to My Azkar", body: "Star a zikr to keep it in My Azkar." },
      swipe: { title: "Start over", body: "Swipe a card sideways to reset its counter." },
      ref: { title: "Source", body: "See where this zikr comes from." },
    },
    hifzSetup: {
      add: { title: "What you know", body: "Add the surahs, juz or pages you've memorized." },
      goal: { title: "Per-session goal", body: "Set how much to review in each session." },
      generate: { title: "Build your plan", body: "Rafeeq splits what you know into review sessions." },
    },
    hifzDashboard: {
      hero: { title: "Swipe for more", body: "Swipe the card to see your stats and best plans." },
      streak: { title: "Your streak", body: "Tap to see your run of consecutive days." },
      sessions: { title: "All sessions", body: "See every session in your plan and mark what's done." },
    },
    hifzSessions: {
      done: { title: "Mark it done", body: "Tick a session off when you finish it." },
      open: { title: "Review & test", body: "Open a session in the mushaf, or quiz yourself on it once it's done." },
    },
    more: {
      cards: { title: "More of Rafeeq", body: "Prayer times & Qibla, the Worship Tracker, Account and Settings." },
    },
    "prayerTimes.setup": {
      grant: { title: "Your location", body: "Allow location access to work out prayer times and the Qibla." },
    },
    prayerTimes: {
      next: { title: "Next prayer", body: "Time left until the next prayer." },
      qibla: { title: "Qibla", body: "Turn your phone until the needle points to the Kaaba." },
      menu: { title: "Options", body: "Calculation method, madhab, which times to show, and widget settings." },
    },
    "prayerTimes.alarms": {
      menu: { title: "Prayer alarms", body: "Set alarms before or after any prayer here. They ring every day, even with the app closed." },
    },
    tracker: {
      item: { title: "Log it", body: "Tap an act of worship once you've done it." },
      locked: { title: "Not yet", body: "Each act unlocks when its time comes in." },
      shortcut: { title: "Shortcut", body: "Long-press azkar or Quran items to open them directly." },
      strip: { title: "Past days", body: "Pick a day from the week or the calendar to review or edit it." },
      header: { title: "Settings & help", body: "Choose what to track and how much each part counts, and read how scoring works." },
    },
    bookmarks: {
      tabs: { title: "Your bookmarks", body: "Saved verses, and listening sessions you can resume." },
    },
    settings: {
      look: { title: "Language & look", body: "Switch between Arabic and English, and between night and day mode." },
      sync: { title: "Offline content", body: "Rafeeq keeps content up to date; you can also sync now." },
      reminders: { title: "Prayer reminders", body: "Get notified when each prayer time comes in." },
      tours: { title: "Tours & tips", body: "Replay the welcome slides and page tips from here." },
    },
    tafsirLibrary: {
      library: { title: "Tafsir library", body: "Download a tafsir to read offline." },
      downloaded: { title: "Your tafsirs", body: "Downloaded tafsirs — remove or re-download them here." },
    },
    account: {
      notes: { title: "Your notes", body: "All your verse notes in one place." },
      backup: { title: "Backup", body: "Export your data and restore it on another device." },
      streak: { title: "Protect your streak", body: "Use a freeze to keep your streak on a day you miss." },
    },
  },
  releases: {
    prayerAlarms: {
      title: "Prayer alarms",
      body: "Set alarms that ring before or after a prayer, like suhoor before Fajr, and follow the prayer times every day. Limit them to certain days or to Ramadan.",
    },
  },
  settings: {
    section: "Tours & tips",
    welcome: "Welcome slides",
    welcomeDesc: "See the app introduction again",
    tips: "Page tips",
    tipsDesc: "Show tips again as you visit each page",
    tipsDone: "Tips will show again as you visit each page.",
    whatsNew: "What's new",
    whatsNewDesc: "The latest features",
    show: "Show",
    replay: "Replay",
  },
};

export const ONBOARDING_COPY: Record<Lang, OnboardingCopy> = { ar, en };
