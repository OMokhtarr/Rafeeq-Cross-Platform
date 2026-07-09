/**
 * App-wide string table for Arabic (default) and English.
 * Source: rafeeq-design-system AppContext.jsx STRINGS — extended to cover
 * every label the real app renders.
 */

export type Lang = "ar" | "en";

export interface AppStrings {
  appName: string;
  appSub: string;
  dir: "rtl" | "ltr";
  tagline: string;

  tabs: {
    quran: string;
    quiz: string;
    azkar: string;
    ahadith: string;
    hifz: string;
    settings: string;
    comingSoon: string;
  };

  home: {
    bismillah: string;
  };

  azkar: {
    title: string;
    subtitle: string;
    back: string;
    backToCategories: string;
    backHome: string;
    done: string;
    doneAlt: string;
    reset: string;
    resetTitle: string;
    zikr: string;
    allDone: string;
  };

  quiz: {
    title: string;
    subtitle: string;
    start: string;
    next: string;
    finish: string;
    backToList: string;
    backHome: string;
  };

  quizList: {
    titleHeader: string;
    subtitleHeader: string;
    akmelTitle: string;
    akmelDesc: string;
    mutashabihatTitle: string;
    mutashabihatDesc: string;
    nehayatTitle: string;
    nehayatDesc: string;
  };

  quizSetup: {
    akmelTitle: string;
    akmelSubtitle: string;
    akmelInfo: string;
    mutashabihatTitle: string;
    mutashabihatSubtitle: string;
    mutashabihatInfo: string;
    nehayatTitle: string;
    nehayatSubtitle: string;
    nehayatInfo: string;
    scope: string;
    scopeSurah: string;
    scopePages: string;
    scopeJuz: string;
    selectSurah: string;
    selectSurahs: string;
    selectJuzs: string;
    pageRange: string;
    filterBySurah: string;
    allPages: string;
    from: string;
    to: string;
    pageCount: string;
    questionCount: string;
    hintOneSurah: string;
    hintOneSurahMin: string;
    pickedSurahs: string;
    pickedJuzs: string;
    juzWord: string;
    start: string;
    backToList: string;
  };

  quizTest: {
    questionOf: string;
    score: string;
    exit: string;
    confirmExit: string;
    exitConfirm: string;
    exitCancel: string;
    hint: string;
    context: string;
    hide: string;
    submit: string;
    skip: string;
    promptComplete: string;
    inputPlaceholder: string;
    correctMsg: string;
    skippedMsg: string;
    wrongMsg: string;
    correctAnswer: string;
    completionVerse: string;
    nextQuestion: string;
    finishQuiz: string;
    completeTitle: string;
    completeAkmelSub: string;
    completeMutashabihatSub: string;
    newQuiz: string;
    quizListLink: string;
    loadingAkmel: string;
    loadingMutashabihat: string;
    errorNoConfig: string;
    errorLoadingAkmel: string;
    errorLoadingMutashabihat: string;
    errorNoVerses: string;
    errorNoMutashabihat: string;
    backToSetup: string;
    ayahLabel: string;
    pageLabel: string;
    hizbLabel: string;
    comingSoon: string;
  };

  mushaf: {
    page: string;
    juz: string;
    hizb: string;
    loading: string;
    menu: string;
    surahsAndJuz: string;
    search: string;
    settings: string;
    searchPlaceholder: string;
    searchTitle: string;
    settingsTitle: string;
    searching: string;
    searchError: string;
    searchResults: string;
    noResults: string;
    verseLabel: string;
    pageLabelInResult: string;
    fontSize: string;
    fontType: string;
    translation: string;
    showTranslation: string;
    hideTranslation: string;
    translationDisabledHint: string;
    moreSettings: string;
    hideSelected: string;
    clearSelection: string;
    showAllHidden: string;
    contextLoading: string;
    contextClose: string;
    contextHint: string;
    contextNextPage: string;
    contextPrevPage: string;
    contextJumpBack: string;
    selectionCount: (n: string) => string;
    hide: string;
    cancelSelection: string;
    backLabel: string;
    closeLabel: string;
    fontSizeOptions: { value: string; label: string }[];
    fontTypeOptions: { value: string; label: string }[];
    translationLoading: string;
    translationError: string;
    audioError: string;
    actionSheetTitle: (verseKey: string) => string;
    play: string;
    pause: string;
    tafsir: string;
    tafsirUnavailable: string;
    tafsirLoading: string;
    tafsirError: string;
    translationUnavailable: string;
    toggleHideTitle: string;
    toggleShowTitle: string;
    nextVerseTitle: string;
    micLabel: string;
    stopLabel: string;
    listening: string;
    noMatch: string;
    identifying: string;
    rateLimited: string;
  };

  playback: {
    title: string;
    selectRange: string;
    startingVerse: string;
    endingVerse: string;
    reciter: string;
    manageDownloads: string;
    playSpeed: string;
    playEachVerse: string;
    playTheRange: string;
    quickSelect: string;
    playAudio: string;
    pause: string;
    resume: string;
    times: (n: number) => string;
    loop: string;
    quickPage: (n: string) => string;
    quickFromPage: (n: string) => string;
    quickSurah: (name: string) => string;
    quickJuz: (n: string) => string;
    quickHizb: (n: string) => string;
    quickAll: string;
    closeLabel: string;
    downloadsTitle: string;
    downloadStart: string;
    downloadRedownload: string;
    downloadCancel: string;
    downloadClear: string;
    downloadProgress: (done: string, total: string) => string;
    downloadEmpty: string;
    nowPlaying: string;
    speedDefault: string;
    rangeInvalid: string;
  };

  settings: {
    title: string;
    subtitle: string;
    saved: string;
    sectionDisplay: string;
    sectionLanguage: string;
    sectionAppearance: string;
    sectionQuran: string;
    sectionRecite: string;
    sectionQuiz: string;
    sectionAzkar: string;
    sectionNotifications: string;
    sectionReset: string;
    fontSize: string;
    fontSizeDesc: string;
    nightMode: string;
    nightModeDesc: string;
    transliteration: string;
    transliterationDesc: string;
    reciter: string;
    reciterDesc: string;
    mushafLabel: string;
    mushafLabelDesc: string;
    reciteEngine: string;
    reciteEngineDesc: string;
    tajweed: string;
    tajweedDesc: string;
    autoNextPage: string;
    autoNextPageDesc: string;
    quizDifficulty: string;
    quizDifficultyDesc: string;
    showHints: string;
    showHintsDesc: string;
    soundEffects: string;
    soundEffectsDesc: string;
    azkarVibration: string;
    azkarVibrationDesc: string;
    azkarCounterSound: string;
    azkarCounterSoundDesc: string;
    prayerReminders: string;
    prayerRemindersDesc: string;
    azkarReminders: string;
    azkarRemindersDesc: string;
    comingSoon: string;
    resetDefaults: string;
    resetDefaultsDesc: string;
    resetButton: string;
    resetConfirmTitle: string;
    resetConfirmMessage: string;
    resetConfirmYes: string;
    resetConfirmCancel: string;
    language: string;
    languageDesc: string;
    arabic: string;
    english: string;
    version: string;
    difficulties: { value: string; label: string }[];
    reciters: { value: string; label: string }[];
  };

  tafsirSettings: {
    title: string;
    subtitle: string;
    backLabel: string;
    sectionDownloaded: string;
    sectionAvailable: string;
    noDownloads: string;
    noDownloadsHint: string;
    remove: string;
    download: string;
    downloading: string;
    downloaded: string;
    languageGroup: (lang: string) => string;
  };

  hifz: {
    tabLabel: string;
    title: string;
    subtitle: string;
    setupTitle: string;
    setupSubtitle: string;
    memorizedSection: string;
    addMemorized: string;
    addByJuz: string;
    addBySurah: string;
    addByPages: string;
    juzLabel: string;
    surahLabel: string;
    fromPage: string;
    toPage: string;
    selectJuz: string;
    selectSurah: string;
    remove: string;
    noMemorized: string;
    goalSection: string;
    goalSectionDesc: string;
    pagesPerSession: string;
    unitPages: string;
    unitRub: string;
    unitHizb: string;
    unitJuz: string;
    quantityPerSession: string;
    generatePlan: string;
    updatePlan: string;
    planTitle: string;
    planSession: (n: string) => string;
    planPages: (from: string, to: string) => string;
    planJuz: (n: string) => string;
    planDone: string;
    planUndone: string;
    planProgress: (done: string, total: string) => string;
    planReset: string;
    planEdit: string;
    planDelete: string;
    planEmpty: string;
    backToSetup: string;
    sessionNext: string;
    sessionRemaining: string;
    quranMemorized: string;
    planCompletion: string;
    sessionsDone: string;
    sessionsLeft: string;
    streakDays: string;
    openInQuran: string;
    quizFromSession: string;
    sessionPrevious: string;
    viewAllSessions: string;
    sessionsAll: string;
    daysActive: string;
    todaySessions: string;
    bestPlan: string;
    bestPlanDays: string;
    bestPlanPages: string;
    bestPlanNone: string;
    heroToday: string;
    heroBestDay: string;
    resetConfirmTitle: string;
    resetConfirmBody: string;
    resetConfirmYes: string;
    resetConfirmNo: string;
    deleteConfirmTitle: string;
    deleteConfirmBody: string;
    deleteConfirmYes: string;
    deleteConfirmNo: string;
    sessionsUncompleted: string;
    sessionsCompleted: string;
    startNewRound: string;
    newRoundConfirmTitle: string;
    newRoundConfirmBody: string;
    newRoundConfirmYes: string;
    newRoundConfirmNo: string;
  };
}

const ar: AppStrings = {
  appName: "رفيق",
  appSub: "RAFEEQ",
  dir: "rtl",
  tagline: "رفيقك القرآني",
  tabs: {
    quran: "القرآن",
    quiz: "اختبارات",
    azkar: "أذكار",
    ahadith: "أحاديث",
    hifz: "الحفظ",
    settings: "إعدادات",
    comingSoon: "قريباً...",
  },
  home: {
    bismillah: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  },
  azkar: {
    title: "الأذكار",
    subtitle: "من كتاب صحيح الأذكار الجامع للعلامة الألباني رحمه الله",
    back: "رجوع",
    backToCategories: "العودة للفئات",
    backHome: "الصفحة الرئيسية",
    done: "✓ تم",
    doneAlt: "تم ✓",
    reset: "↺",
    resetTitle: "إعادة العداد",
    zikr: "ذِكر",
    allDone: "✅ اكتملت الأذكار",
  },
  quiz: {
    title: "الاختبارات",
    subtitle: "اختر اختباراً للبدء",
    start: "ابدأ الاختبار",
    next: "السؤال التالي",
    finish: "🏁 إنهاء الاختبار",
    backToList: "العودة للقائمة",
    backHome: "العودة للصفحة الرئيسية",
  },
  quizList: {
    titleHeader: "الاختبارات المتاحة",
    subtitleHeader: "Available Quizzes",
    akmelTitle: "أكمل الآية",
    akmelDesc: "تُعرض عليك بداية آية وعليك إكمالها من حفظك",
    mutashabihatTitle: "المتشابهات",
    mutashabihatDesc: "ميّز بين الآيات المتشابهة وأكمل الآية الصحيحة",
    nehayatTitle: "أكمل النهايات",
    nehayatDesc: "اختر الخاتمة الصحيحة للآية بعد علامة الوقف",
  },
  quizSetup: {
    akmelTitle: "أكمل الآية",
    akmelSubtitle: "Quran Quiz — Complete the Verse",
    akmelInfo:
      "ستُعرض عليك بداية آية وعليك إكمالها. اختر نطاق الاختبار وعدد الأسئلة.",
    mutashabihatTitle: "المتشابهات",
    mutashabihatSubtitle: "Mutashabihat Quiz — Complete the Similar Verse",
    mutashabihatInfo:
      "ستُعرض عليك بداية آية مشتركة بين عدة آيات متشابهة، عليك إكمال الآية الصحيحة.",
    nehayatTitle: "أكمل النهايات",
    nehayatSubtitle: "Waqf Quiz — Complete the Ending",
    nehayatInfo:
      "ستُعرض عليك آية مقطوعة عند آخر علامة وقف، اختر الخاتمة الصحيحة من بين أربعة خيارات.",
    scope: "النطاق",
    scopeSurah: "سورة",
    scopePages: "صفحة",
    scopeJuz: "جزء",
    selectSurah: "اختر السورة",
    selectSurahs: "اختر السور",
    selectJuzs: "اختر الأجزاء",
    pageRange: "نطاق الصفحات",
    filterBySurah: "تصفية بسورة",
    allPages: "كل الصفحات",
    from: "من",
    to: "إلى",
    pageCount: "عدد الصفحات",
    questionCount: "عدد الأسئلة",
    hintOneSurah: "اختر سورة واحدة",
    hintOneSurahMin: "اختر سورة واحدة على الأقل",
    pickedSurahs: "سور",
    pickedJuzs: "أجزاء",
    juzWord: "جزء",
    start: "ابدأ الاختبار",
    backToList: "العودة للقائمة",
  },
  quizTest: {
    questionOf: "سؤال",
    score: "النتيجة",
    exit: "✕",
    confirmExit: "هل تريد الخروج من الاختبار؟",
    exitConfirm: "خروج",
    exitCancel: "متابعة",
    hint: "تلميح",
    context: "سياق",
    hide: "إخفاء",
    submit: "إرسال",
    skip: "تخطي",
    promptComplete: "✽ أكمل الآية ✽",
    inputPlaceholder: "أكمل الآية هنا…",
    correctMsg: "أحسنت! إجابة صحيحة",
    skippedMsg: "تم التخطي",
    wrongMsg: "إجابة خاطئة",
    correctAnswer: "الإجابة الصحيحة:",
    completionVerse: "إكمال الآية:",
    nextQuestion: "السؤال التالي",
    finishQuiz: "إنهاء الاختبار",
    completeTitle: "انتهى الاختبار!",
    completeAkmelSub: "Akmel Al-Ayah Quiz Complete",
    completeMutashabihatSub: "Mutashabihat Quiz Complete",
    newQuiz: "اختبار جديد",
    quizListLink: "قائمة الاختبارات",
    loadingAkmel: "جاري تحضير الأسئلة…",
    loadingMutashabihat: "جاري تحميل المتشابهات…",
    errorNoConfig: "لا يوجد إعداد للاختبار",
    errorLoadingAkmel: "حدث خطأ أثناء تحميل الأسئلة",
    errorLoadingMutashabihat: "حدث خطأ أثناء تحميل الأسئلة",
    errorNoVerses: "لم يُعثر على آيات في النطاق المحدد.\nجرّب نطاقاً أوسع.",
    errorNoMutashabihat:
      "لم يُعثر على آيات متشابهة في النطاق المحدد.\nجرّب نطاقاً أوسع.",
    backToSetup: "العودة للإعداد",
    ayahLabel: "الآية",
    pageLabel: "صفحة",
    hizbLabel: "الحزب",
    comingSoon: "قريباً...",
  },
  mushaf: {
    page: "صفحة",
    juz: "جزء",
    hizb: "حزب",
    loading: "جاري تحميل الصفحة...",
    menu: "القائمة",
    surahsAndJuz: "السور والأجزاء",
    search: "بحث",
    settings: "الإعدادات",
    searchPlaceholder: "ابحث في القرآن الكريم...",
    searchTitle: "بحث في القرآن",
    settingsTitle: "الإعدادات",
    searching: "جاري البحث…",
    searchError: "تعذر البحث الآن، حاول مرة أخرى",
    searchResults: "نتائج البحث",
    noResults: "لا توجد نتائج",
    verseLabel: "الآية",
    pageLabelInResult: "صفحة",
    fontSize: "حجم الخط",
    fontType: "نوع الخط",
    translation: "الترجمة",
    showTranslation: "إظهار الترجمة",
    hideTranslation: "إخفاء الترجمة",
    translationDisabledHint: "اختر ترجمة من الإعدادات أولاً",
    moreSettings: "المزيد من الإعدادات",
    hideSelected: "إخفاء الآيات المحددة",
    clearSelection: "إلغاء التحديد",
    showAllHidden: "إظهار كل الآيات المخفية",
    selectionCount: (n: string) => `${n} آية محددة`,
    hide: "إخفاء",
    cancelSelection: "إلغاء التحديد",
    backLabel: "رجوع",
    closeLabel: "إغلاق",
    contextLoading: "جاري تحميل الصفحة…",
    contextClose: "إغلاق",
    contextHint: "تلميح",
    contextNextPage: "الصفحة التالية",
    contextPrevPage: "الصفحة السابقة",
    contextJumpBack: "العودة إلى آية السؤال",
    fontSizeOptions: [
      { value: "small", label: "صغير" },
      { value: "medium", label: "متوسط" },
      { value: "large", label: "كبير" },
      { value: "xlarge", label: "كبير جداً" },
    ],
    fontTypeOptions: [
      { value: "amiri", label: "أميري" },
      { value: "traditional", label: "تقليدي" },
      { value: "uthmani", label: "عثمان" },
      { value: "naskh", label: "نسخ" },
    ],
    translationLoading: "جاري تحميل الترجمة…",
    translationError: "تعذر تحميل الترجمة",
    audioError: "تعذر تشغيل الصوت",
    actionSheetTitle: (verseKey: string) => `الآية ${verseKey}`,
    play: "تشغيل",
    pause: "إيقاف",
    tafsir: "التفسير",
    tafsirUnavailable: "التفسير غير متوفر بعد",
    tafsirLoading: "جاري تحميل التفسير…",
    tafsirError: "تعذر تحميل التفسير",
    translationUnavailable: "اختر ترجمة من الإعدادات",
    toggleHideTitle: "إخفاء الآيات المحددة",
    toggleShowTitle: "إظهار الآيات المحددة",
    nextVerseTitle: "إظهار الآية التالية",
    micLabel: "المايكروفون",
    stopLabel: "إيقاف التشغيل",
    listening: "أستمع… تابع التلاوة",
    noMatch: "لم يتم التعرف على الآية — تأكد من أنك في الصفحة الصحيحة",
    identifying: "جاري تحديد الآية…",
    rateLimited: "تم إبطاء الاستماع مؤقتًا (الحد الأقصى للطلبات)…",
  },
  playback: {
    title: "إعدادات التشغيل",
    selectRange: "اختر النطاق",
    startingVerse: "الآية الأولى",
    endingVerse: "الآية الأخيرة",
    reciter: "القارئ",
    manageDownloads: "إدارة التحميلات",
    playSpeed: "سرعة التلاوة",
    playEachVerse: "تكرار الآية",
    playTheRange: "تكرار النطاق",
    quickSelect: "اختيار سريع",
    playAudio: "تشغيل التلاوة",
    pause: "إيقاف",
    resume: "متابعة",
    times: (n: number) => (n === 1 ? "مرة واحدة" : `${n} مرات`),
    loop: "تكرار مستمر",
    quickPage: (n: string) => `الصفحة ${n}`,
    quickFromPage: (n: string) => `من الصفحة ${n}`,
    quickSurah: (name: string) => `سورة ${name}`,
    quickJuz: (n: string) => `الجزء ${n}`,
    quickHizb: (n: string) => `الحزب ${n}`,
    quickAll: "كامل المصحف",
    closeLabel: "إغلاق",
    downloadsTitle: "إدارة التحميلات",
    downloadStart: "تحميل النطاق المختار",
    downloadRedownload: "إعادة التحميل",
    downloadCancel: "إيقاف التحميل",
    downloadClear: "مسح التحميلات",
    downloadProgress: (done: string, total: string) =>
      `تم تحميل ${done} من ${total}`,
    downloadEmpty: "لا توجد ملفات محفوظة بعد",
    nowPlaying: "قيد التشغيل",
    speedDefault: "افتراضي",
    rangeInvalid: "نطاق غير صالح",
  },

  settings: {
    title: "الإعدادات",
    subtitle: "تخصيص تجربة التطبيق",
    saved: "✓",
    sectionDisplay: "العرض",
    sectionLanguage: "اللغة",
    sectionAppearance: "المظهر",
    sectionQuran: "القرآن الكريم",
    sectionRecite: "التسميع",
    sectionQuiz: "الاختبارات",
    sectionAzkar: "الأذكار",
    sectionNotifications: "التنبيهات",
    sectionReset: "إعادة الضبط",
    fontSize: "حجم الخط العربي",
    fontSizeDesc: "حجم النصوص القرآنية والأذكار",
    nightMode: "الوضع الليلي",
    nightModeDesc: "خلفية داكنة تريح العين",
    transliteration: "إظهار النطق اللاتيني",
    transliterationDesc: "الحروف الرومانية تحت الآيات",
    reciter: "القارئ",
    reciterDesc: "الصوت المستخدم في التلاوة",
    mushafLabel: "المصحف",
    mushafLabelDesc: "اختر طريقة عرض المصحف",
    reciteEngine: "محرك التعرف على التلاوة",
    reciteEngineDesc: "الخدمة المستخدمة لتحويل تلاوتك إلى نص",
    tajweed: "ألوان التجويد",
    tajweedDesc: "تلوين أحكام التجويد في الآيات",
    autoNextPage: "الانتقال التلقائي",
    autoNextPageDesc: "الانتقال للصفحة التالية عند نهاية الصفحة",
    quizDifficulty: "مستوى الصعوبة",
    quizDifficultyDesc: "المستوى الافتراضي للاختبارات",
    showHints: "إظهار التلميحات",
    showHintsDesc: "تفعيل التلميحات افتراضياً في الاختبار",
    soundEffects: "المؤثرات الصوتية",
    soundEffectsDesc: "أصوات الإجابة الصحيحة والخاطئة",
    azkarVibration: "الاهتزاز عند العدّ",
    azkarVibrationDesc: "اهتزاز خفيف عند كل ضغطة",
    azkarCounterSound: "صوت العدّاد",
    azkarCounterSoundDesc: "صوت عند الوصول لعدد الذِّكر",
    prayerReminders: "تنبيهات مواقيت الصلاة",
    prayerRemindersDesc: "قريباً — سيتطلب إذن الموقع",
    azkarReminders: "تذكير الأذكار اليومية",
    azkarRemindersDesc: "تنبيه صباحي ومسائي للأذكار",
    comingSoon: "قريباً",
    resetDefaults: "استعادة الإعدادات الافتراضية",
    resetDefaultsDesc: "إعادة جميع الإعدادات لقيمها الأصلية",
    resetButton: "إعادة",
    resetConfirmTitle: "استعادة الإعدادات؟",
    resetConfirmMessage: "سيتم إعادة جميع الإعدادات إلى قيمها الافتراضية. لا يمكن التراجع عن هذا الإجراء.",
    resetConfirmYes: "نعم، استعادة",
    resetConfirmCancel: "إلغاء",
    language: "لغة التطبيق",
    languageDesc: "اختر لغة واجهة التطبيق",
    arabic: "العربية",
    english: "English",
    version: "الإصدار 1.0.0",
    difficulties: [
      { value: "easy", label: "سهل" },
      { value: "medium", label: "متوسط" },
      { value: "hard", label: "صعب" },
    ],
    reciters: [
      { value: "minshawi-murattal", label: "محمد صديق المنشاوي — مرتل" },
      { value: "husary", label: "محمود خليل الحصري" },
      { value: "minshawi", label: "محمد صديق المنشاوي — مجود" },
      { value: "sudais", label: "عبد الرحمن السديس" },
      { value: "afasy", label: "مشاري راشد العفاسي" },
      { value: "ghamdi", label: "سعد الغامدي" },
    ],
  },

  tafsirSettings: {
    title: "التفاسير",
    subtitle: "إدارة التفاسير المحفوظة",
    backLabel: "رجوع",
    sectionDownloaded: "التفاسير المحفوظة",
    sectionAvailable: "التفاسير المتاحة",
    noDownloads: "لا توجد تفاسير محفوظة بعد",
    noDownloadsHint: "احفظ تفسيراً من القائمة أدناه لاستخدامه بدون إنترنت",
    remove: "إزالة",
    download: "حفظ",
    downloading: "جارٍ الحفظ…",
    downloaded: "محفوظ",
    languageGroup: (lang: string) => lang,
  },

  hifz: {
    tabLabel: "الحفظ",
    title: "خطة المراجعة",
    subtitle: "راجع حفظك بانتظام",
    setupTitle: "إعداد خطة المراجعة",
    setupSubtitle: "حدّد ما حفظته وهدف المراجعة",
    memorizedSection: "ما حفظتَه",
    addMemorized: "إضافة محفوظات",
    addByJuz: "بجزء",
    addBySurah: "بسورة",
    addByPages: "بصفحات",
    juzLabel: "الجزء",
    surahLabel: "السورة",
    fromPage: "من صفحة",
    toPage: "إلى صفحة",
    selectJuz: "اختر الجزء",
    selectSurah: "اختر السورة",
    remove: "حذف",
    noMemorized: "لم تُضف محفوظات بعد",
    goalSection: "إعداد الجلسات",
    goalSectionDesc: "تُقسَّم محفوظاتك إلى جلسات متساوية. أنجز ما تستطيع منها كل يوم وفق وقتك.",
    pagesPerSession: "لكل جلسة",
    unitPages: "صفحة",
    unitRub: "ربع",
    unitHizb: "حزب",
    unitJuz: "جزء",
    quantityPerSession: "الكمية لكل جلسة",
    generatePlan: "توليد الخطة",
    updatePlan: "تحديث الخطة",
    planTitle: "خطة المراجعة",
    planSession: (n: string) => `الجلسة ${n}`,
    planPages: (from: string, to: string) => `ص ${from} – ${to}`,
    planJuz: (n: string) => `الجزء ${n}`,
    planDone: "تمّ",
    planUndone: "لم يتمّ",
    planProgress: (done: string, total: string) => `${done} / ${total} جلسة`,
    planReset: "إعادة الخطة",
    planEdit: "تعديل الإعداد",
    planDelete: "حذف الخطة",
    planEmpty: "لا توجد جلسات في الخطة",
    backToSetup: "العودة للإعداد",
    sessionNext: "الحالية",
    sessionRemaining: "التالية",
    quranMemorized: "من القرآن محفوظ",
    planCompletion: "من الخطة منجز",
    sessionsDone: "مكتملة",
    sessionsLeft: "متبقية",
    streakDays: "يوم متتالي",
    openInQuran: "افتح في القرآن",
    quizFromSession: "اختبر نفسك",
    sessionPrevious: "السابقة",
    viewAllSessions: "عرض جميع الجلسات",
    sessionsAll: "جميع الجلسات",
    daysActive: "يوم منذ البداية",
    todaySessions: "جلسة اليوم",
    bestPlan: "أفضل خطة",
    bestPlanDays: "يوم",
    bestPlanPages: "ص",
    bestPlanNone: "لا يوجد بعد",
    heroToday: "جلسة اليوم",
    heroBestDay: "أفضل يوم",
    resetConfirmTitle: "إعادة الخطة؟",
    resetConfirmBody: "سيتم مسح تقدمك في جميع الجلسات. هل أنت متأكد؟",
    resetConfirmYes: "إعادة",
    resetConfirmNo: "إلغاء",
    deleteConfirmTitle: "حذف الخطة؟",
    deleteConfirmBody: "سيتم حذف الخطة وكل تقدمك نهائيًا والعودة إلى صفحة إنشاء خطة جديدة. هل أنت متأكد؟",
    deleteConfirmYes: "حذف",
    deleteConfirmNo: "إلغاء",
    sessionsUncompleted: "غير مكتملة",
    sessionsCompleted: "مكتملة",
    startNewRound: "ابدأ جولة جديدة",
    newRoundConfirmTitle: "ابدأ جولة جديدة؟",
    newRoundConfirmBody: "سيتم إعادة ضبط جميع الجلسات وبدء الخطة من جديد. سيُحفظ سجل أفضل خطة.",
    newRoundConfirmYes: "ابدأ",
    newRoundConfirmNo: "إلغاء",
  },
};

const en: AppStrings = {
  appName: "Rafeeq",
  appSub: "رفيق",
  dir: "ltr",
  tagline: "Your Quran Companion",
  tabs: {
    quran: "Quran",
    quiz: "Quizzes",
    azkar: "Azkar",
    ahadith: "Ahadith",
    hifz: "Hifz",
    settings: "Settings",
    comingSoon: "Coming soon...",
  },
  home: {
    bismillah: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  },
  azkar: {
    title: "Azkar",
    subtitle:
      "From Sahih al-Adhkar al-Jami' by Sheikh al-Albani, may Allah have mercy on him",
    back: "Back",
    backToCategories: "Back to Categories",
    backHome: "Home",
    done: "✓ Done",
    doneAlt: "Done ✓",
    reset: "↺",
    resetTitle: "Reset counter",
    zikr: "dhikr",
    allDone: "✅ All complete",
  },
  quiz: {
    title: "Quizzes",
    subtitle: "Choose a quiz to begin",
    start: "Start Quiz",
    next: "Next Question",
    finish: "🏁 Finish Quiz",
    backToList: "Back to List",
    backHome: "Back to Home",
  },
  quizList: {
    titleHeader: "Available Quizzes",
    subtitleHeader: "الاختبارات المتاحة",
    akmelTitle: "Complete the Verse",
    akmelDesc: "Complete the verse from memory",
    mutashabihatTitle: "Mutashabihat",
    mutashabihatDesc: "Distinguish and complete similar-opening verses",
    nehayatTitle: "Complete the Ending",
    nehayatDesc: "Choose the correct ending of the verse after its Waqf sign",
  },
  quizSetup: {
    akmelTitle: "Complete the Verse",
    akmelSubtitle: "اختبار القرآن — أكمل الآية",
    akmelInfo:
      "You will be shown the start of a verse and asked to complete it. Choose your scope and number of questions.",
    mutashabihatTitle: "Mutashabihat",
    mutashabihatSubtitle: "اختبار المتشابهات — أكمل الآية المتشابهة",
    mutashabihatInfo:
      "You'll be shown an opening shared by several similar verses — complete the correct one.",
    nehayatTitle: "Complete the Ending",
    nehayatSubtitle: "اختبار الوقف — أكمل النهايات",
    nehayatInfo:
      "A verse is shown up to its last Waqf sign. Choose the correct ending from four options.",
    scope: "Scope",
    scopeSurah: "Surah",
    scopePages: "Pages",
    scopeJuz: "Juz",
    selectSurah: "Select Surah",
    selectSurahs: "Select Surahs",
    selectJuzs: "Select Juzs",
    pageRange: "Page Range",
    filterBySurah: "Filter by Surah",
    allPages: "All Pages",
    from: "From",
    to: "To",
    pageCount: "Page count",
    questionCount: "Questions",
    hintOneSurah: "Pick one surah",
    hintOneSurahMin: "Pick at least one surah",
    pickedSurahs: "surahs",
    pickedJuzs: "juzs",
    juzWord: "Juz",
    start: "Start Quiz",
    backToList: "Back to List",
  },
  quizTest: {
    questionOf: "Question",
    score: "Score",
    exit: "✕",
    confirmExit: "Exit the quiz?",
    exitConfirm: "Exit",
    exitCancel: "Continue",
    hint: "Hint",
    context: "Context",
    hide: "Hide",
    submit: "Submit",
    skip: "Skip",
    promptComplete: "✽ Complete the verse ✽",
    inputPlaceholder: "Type the rest of the verse here…",
    correctMsg: "Correct — well done!",
    skippedMsg: "Skipped",
    wrongMsg: "Incorrect",
    correctAnswer: "Correct answer:",
    completionVerse: "Completion:",
    nextQuestion: "Next Question",
    finishQuiz: "Finish Quiz",
    completeTitle: "Quiz complete!",
    completeAkmelSub: "اكتمل اختبار أكمل الآية",
    completeMutashabihatSub: "اكتمل اختبار المتشابهات",
    newQuiz: "New Quiz",
    quizListLink: "Quiz List",
    loadingAkmel: "Preparing questions…",
    loadingMutashabihat: "Loading mutashabihat…",
    errorNoConfig: "No quiz configuration found",
    errorLoadingAkmel: "Error loading questions",
    errorLoadingMutashabihat: "Error loading questions",
    errorNoVerses: "No verses found in the selected range.\nTry a wider scope.",
    errorNoMutashabihat:
      "No similar verses found in the selected range.\nTry a wider scope.",
    backToSetup: "Back to Setup",
    ayahLabel: "Ayah",
    pageLabel: "Page",
    hizbLabel: "Hizb",
    comingSoon: "Coming soon...",
  },
  mushaf: {
    page: "Page",
    juz: "Juz",
    hizb: "Hizb",
    loading: "Loading page...",
    menu: "Menu",
    surahsAndJuz: "Surahs & Juz",
    search: "Search",
    settings: "Settings",
    searchPlaceholder: "Search the Quran...",
    searchTitle: "Search the Quran",
    settingsTitle: "Settings",
    searching: "Searching…",
    searchError: "Search failed, please try again",
    searchResults: "Results",
    noResults: "No results",
    verseLabel: "Verse",
    pageLabelInResult: "Page",
    fontSize: "Font size",
    fontType: "Font type",
    translation: "Translation",
    showTranslation: "Show translation",
    hideTranslation: "Hide translation",
    translationDisabledHint: "Pick a translation in Settings first",
    moreSettings: "More settings",
    hideSelected: "Hide selected verses",
    clearSelection: "Clear selection",
    showAllHidden: "Show all hidden verses",
    contextLoading: "Loading page…",
    contextClose: "Close",
    contextHint: "Hint",
    contextNextPage: "Next page",
    contextPrevPage: "Previous page",
    contextJumpBack: "Go back to the target verse",
    selectionCount: (n: string) => `${n} verse${n === "1" ? "" : "s"} selected`,
    hide: "Hide",
    cancelSelection: "Cancel selection",
    backLabel: "Back",
    closeLabel: "Close",
    fontSizeOptions: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
      { value: "xlarge", label: "X-Large" },
    ],
    fontTypeOptions: [
      { value: "amiri", label: "Amiri" },
      { value: "traditional", label: "Traditional" },
      { value: "uthmani", label: "Uthmani" },
      { value: "naskh", label: "Naskh" },
    ],
    translationLoading: "Loading translation…",
    translationError: "Could not load translation",
    audioError: "Could not play audio",
    actionSheetTitle: (verseKey: string) => `Verse ${verseKey}`,
    play: "Play",
    pause: "Pause",
    tafsir: "Tafsir",
    tafsirUnavailable: "Tafsir is not available yet",
    tafsirLoading: "Loading tafsir…",
    tafsirError: "Could not load tafsir",
    translationUnavailable: "Pick a translation in Settings",
    toggleHideTitle: "Hide selected verses",
    toggleShowTitle: "Show selected verses",
    nextVerseTitle: "Reveal next verse",
    micLabel: "Microphone",
    stopLabel: "Stop playback",
    listening: "Listening… keep reciting",
    noMatch: "Not matching this page — make sure you're on the right page",
    identifying: "Identifying the verse…",
    rateLimited: "Slowing down temporarily (rate limit)…",
  },
  playback: {
    title: "Playback Settings",
    selectRange: "Select Range",
    startingVerse: "Starting Verse",
    endingVerse: "Ending Verse",
    reciter: "Reciter",
    manageDownloads: "Manage downloads",
    playSpeed: "Play speed",
    playEachVerse: "Play each verse",
    playTheRange: "Play the range",
    quickSelect: "Quick Select",
    playAudio: "Play Audio",
    pause: "Pause",
    resume: "Resume",
    times: (n: number) => (n === 1 ? "1 time" : `${n} times`),
    loop: "Loop",
    quickPage: (n: string) => `PG. ${n}`,
    quickFromPage: (n: string) => `from PG. ${n}`,
    quickSurah: (name: string) => `Surah ${name}`,
    quickJuz: (n: string) => `Juz ${n}`,
    quickHizb: (n: string) => `Hizb ${n}`,
    quickAll: "All",
    closeLabel: "Close",
    downloadsTitle: "Manage downloads",
    downloadStart: "Download selected range",
    downloadRedownload: "Re-download",
    downloadCancel: "Stop download",
    downloadClear: "Clear cached audio",
    downloadProgress: (done: string, total: string) =>
      `Downloaded ${done} of ${total}`,
    downloadEmpty: "No audio cached yet",
    nowPlaying: "Now playing",
    speedDefault: "default",
    rangeInvalid: "Invalid range",
  },

  settings: {
    title: "Settings",
    subtitle: "Customize your experience",
    saved: "✓",
    sectionDisplay: "Display",
    sectionLanguage: "Language",
    sectionAppearance: "Appearance",
    sectionQuran: "Quran",
    sectionRecite: "Recitation",
    sectionQuiz: "Quizzes",
    sectionAzkar: "Azkar",
    sectionNotifications: "Notifications",
    sectionReset: "Reset",
    fontSize: "Arabic Font Size",
    fontSizeDesc: "Size of Quranic and Azkar text",
    nightMode: "Night Mode",
    nightModeDesc: "Dark background for comfortable reading",
    transliteration: "Show Transliteration",
    transliterationDesc: "Roman letters below each verse",
    reciter: "Reciter",
    reciterDesc: "Voice used for recitation",
    mushafLabel: "Mushaf",
    mushafLabelDesc: "Choose how the Mushaf is displayed",
    reciteEngine: "Recitation recognition engine",
    reciteEngineDesc: "Service used to turn your recitation into text",
    tajweed: "Tajweed Colors",
    tajweedDesc: "Color-code tajweed rules in verses",
    autoNextPage: "Auto-advance",
    autoNextPageDesc: "Move to next page when scrolled to end",
    quizDifficulty: "Difficulty",
    quizDifficultyDesc: "Default difficulty for quizzes",
    showHints: "Show Hints",
    showHintsDesc: "Enable hints by default during quizzes",
    soundEffects: "Sound Effects",
    soundEffectsDesc: "Right/wrong answer sounds",
    azkarVibration: "Counter Vibration",
    azkarVibrationDesc: "Gentle haptic on each tap",
    azkarCounterSound: "Counter Sound",
    azkarCounterSoundDesc: "Sound when a dhikr is completed",
    prayerReminders: "Prayer Time Reminders",
    prayerRemindersDesc: "Coming soon — requires location permission",
    azkarReminders: "Daily Azkar Reminders",
    azkarRemindersDesc: "Morning and evening notifications",
    comingSoon: "Coming soon",
    resetDefaults: "Restore Defaults",
    resetDefaultsDesc: "Reset all settings to their original values",
    resetButton: "Reset",
    resetConfirmTitle: "Restore settings?",
    resetConfirmMessage: "All settings will be reset to their default values. This action cannot be undone.",
    resetConfirmYes: "Yes, restore",
    resetConfirmCancel: "Cancel",
    language: "App Language",
    languageDesc: "Choose interface language",
    arabic: "العربية",
    english: "English",
    version: "Version 1.0.0",
    difficulties: [
      { value: "easy", label: "Easy" },
      { value: "medium", label: "Medium" },
      { value: "hard", label: "Hard" },
    ],
    reciters: [
      {
        value: "minshawi-murattal",
        label: "Muhammad Siddiq Al-Minshawi — Murattal",
      },
      { value: "husary", label: "Mahmoud Khalil Al-Husary" },
      { value: "minshawi", label: "Muhammad Siddiq Al-Minshawi — Mujawwad" },
      { value: "sudais", label: "Abdul Rahman Al-Sudais" },
      { value: "afasy", label: "Mishary Rashid Al-Afasy" },
      { value: "ghamdi", label: "Sa'd Al-Ghamdi" },
    ],
  },

  tafsirSettings: {
    title: "Tafsir Library",
    subtitle: "Manage saved tafsirs",
    backLabel: "Back",
    sectionDownloaded: "Saved Tafsirs",
    sectionAvailable: "Available Tafsirs",
    noDownloads: "No tafsirs saved yet",
    noDownloadsHint: "Save a tafsir from the list below to use it offline",
    remove: "Remove",
    download: "Save",
    downloading: "Saving…",
    downloaded: "Saved",
    languageGroup: (lang: string) => lang,
  },

  hifz: {
    tabLabel: "Hifz",
    title: "Revision Planner",
    subtitle: "Revise your memorization regularly",
    setupTitle: "Set Up Your Plan",
    setupSubtitle: "Define what you've memorized and your revision goal",
    memorizedSection: "Memorized Content",
    addMemorized: "Add Memorized",
    addByJuz: "By Juz",
    addBySurah: "By Surah",
    addByPages: "By Pages",
    juzLabel: "Juz",
    surahLabel: "Surah",
    fromPage: "From page",
    toPage: "To page",
    selectJuz: "Select Juz",
    selectSurah: "Select Surah",
    remove: "Remove",
    noMemorized: "No memorized content added yet",
    goalSection: "Session Setup",
    goalSectionDesc: "Your memorized content is divided into equal sessions. Complete as many as you can each day at your own pace.",
    pagesPerSession: "per session",
    unitPages: "Pages",
    unitRub: "Rub'",
    unitHizb: "Hizb",
    unitJuz: "Juz",
    quantityPerSession: "Quantity per session",
    generatePlan: "Generate Plan",
    updatePlan: "Update Plan",
    planTitle: "Revision Plan",
    planSession: (n: string) => `Session ${n}`,
    planPages: (from: string, to: string) => `Pg. ${from}–${to}`,
    planJuz: (n: string) => `Juz ${n}`,
    planDone: "Done",
    planUndone: "Mark done",
    planProgress: (done: string, total: string) => `${done} / ${total} sessions`,
    planReset: "Reset Plan",
    planEdit: "Edit Setup",
    planDelete: "Delete Plan",
    planEmpty: "No sessions in this plan",
    backToSetup: "Back to Setup",
    sessionNext: "Current",
    sessionRemaining: "Up Next",
    quranMemorized: "Quran memorized",
    planCompletion: "Plan complete",
    sessionsDone: "done",
    sessionsLeft: "left",
    streakDays: "day streak",
    openInQuran: "Open in Quran",
    quizFromSession: "Quiz yourself",
    sessionPrevious: "Previous",
    viewAllSessions: "View All Sessions",
    sessionsAll: "All Sessions",
    daysActive: "days active",
    todaySessions: "today",
    bestPlan: "Best Plan",
    bestPlanDays: "d",
    bestPlanPages: "pg",
    bestPlanNone: "None yet",
    heroToday: "today",
    heroBestDay: "best day",
    resetConfirmTitle: "Reset Plan?",
    resetConfirmBody: "This will clear your progress on all sessions. Are you sure?",
    resetConfirmYes: "Reset",
    resetConfirmNo: "Cancel",
    deleteConfirmTitle: "Delete Plan?",
    deleteConfirmBody: "This permanently deletes the plan and all your progress, returning you to the create-plan screen. Are you sure?",
    deleteConfirmYes: "Delete",
    deleteConfirmNo: "Cancel",
    sessionsUncompleted: "Uncompleted",
    sessionsCompleted: "Completed",
    startNewRound: "Start New Round",
    newRoundConfirmTitle: "Start a New Round?",
    newRoundConfirmBody: "All sessions will be reset and the plan starts fresh. Your best plan record will be saved.",
    newRoundConfirmYes: "Start",
    newRoundConfirmNo: "Cancel",
  },
};

export const STRINGS: Record<Lang, AppStrings> = { ar, en };
