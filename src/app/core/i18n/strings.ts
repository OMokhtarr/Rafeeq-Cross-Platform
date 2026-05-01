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
    quote: string;
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
  };

  quizSetup: {
    akmelTitle: string;
    akmelSubtitle: string;
    akmelInfo: string;
    mutashabihatTitle: string;
    mutashabihatSubtitle: string;
    mutashabihatInfo: string;
    scope: string;
    scopeSurah: string;
    scopePages: string;
    scopeJuz: string;
    selectSurah: string;
    selectSurahs: string;
    selectJuzs: string;
    pageRange: string;
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
    resetDefaults: string;
    resetDefaultsDesc: string;
    resetButton: string;
    language: string;
    languageDesc: string;
    arabic: string;
    english: string;
    version: string;
    quote: string;
    difficulties: { value: string; label: string }[];
    reciters: { value: string; label: string }[];
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
    settings: "إعدادات",
    comingSoon: "قريباً",
  },
  home: {
    bismillah: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  },
  azkar: {
    title: "الأذكار",
    subtitle: "من كتاب صحيح الأذكار الجامع للعلامة الألباني رحمه الله",
    back: "← رجوع",
    backToCategories: "← العودة للفئات",
    backHome: "← الصفحة الرئيسية",
    done: "✓ تم",
    doneAlt: "تم ✓",
    reset: "↺",
    resetTitle: "إعادة العداد",
    zikr: "ذِكر",
    allDone: "✅ اكتملت الأذكار",
    quote: "«مَنْ سَبَّحَ اللَّهَ فِي دُبُرِ كُلِّ صَلَاةٍ ثَلَاثًا وَثَلَاثِينَ»",
  },
  quiz: {
    title: "الاختبارات",
    subtitle: "اختر اختباراً للبدء",
    start: "ابدأ الاختبار",
    next: "← السؤال التالي",
    finish: "🏁 إنهاء الاختبار",
    backToList: "← العودة للقائمة",
    backHome: "← العودة للصفحة الرئيسية",
  },
  quizList: {
    titleHeader: "الاختبارات المتاحة",
    subtitleHeader: "Available Quizzes",
    akmelTitle: "أكمل الآية",
    akmelDesc: "تُعرض عليك بداية آية وعليك إكمالها من حفظك",
    mutashabihatTitle: "المتشابهات",
    mutashabihatDesc: "ميّز بين الآيات المتشابهة وأكمل الآية الصحيحة",
  },
  quizSetup: {
    akmelTitle: "أكمل الآية",
    akmelSubtitle: "Quran Quiz — Complete the Verse",
    akmelInfo: "ستُعرض عليك بداية آية وعليك إكمالها. اختر نطاق الاختبار وعدد الأسئلة.",
    mutashabihatTitle: "المتشابهات",
    mutashabihatSubtitle: "Mutashabihat Quiz — Complete the Similar Verse",
    mutashabihatInfo: "ستُعرض عليك بداية آية مشتركة بين عدة آيات متشابهة، عليك إكمال الآية الصحيحة.",
    scope: "النطاق",
    scopeSurah: "سورة",
    scopePages: "صفحة",
    scopeJuz: "جزء",
    selectSurah: "اختر السورة",
    selectSurahs: "اختر السور",
    selectJuzs: "اختر الأجزاء",
    pageRange: "نطاق الصفحات",
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
    backToList: "← العودة للقائمة",
  },
  quizTest: {
    questionOf: "سؤال",
    score: "النتيجة",
    exit: "✕ خروج",
    confirmExit: "هل تريد الخروج من الاختبار؟",
    hint: "💡 تلميح",
    context: "📖 سياق",
    hide: "📖 إخفاء",
    submit: "➤ إرسال",
    skip: "⏭ تخطي",
    promptComplete: "✽ أكمل الآية ✽",
    inputPlaceholder: "اكتب إكمال الآية هنا…",
    correctMsg: "أحسنت! إجابة صحيحة",
    skippedMsg: "تم التخطي",
    wrongMsg: "إجابة خاطئة",
    correctAnswer: "الإجابة الصحيحة:",
    completionVerse: "إكمال الآية:",
    nextQuestion: "← السؤال التالي",
    finishQuiz: "🏁 إنهاء الاختبار",
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
    errorNoMutashabihat: "لم يُعثر على آيات متشابهة في النطاق المحدد.\nجرّب نطاقاً أوسع.",
    backToSetup: "← العودة للإعداد",
    ayahLabel: "الآية",
    pageLabel: "صفحة",
    hizbLabel: "الحزب",
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
    resetDefaults: "استعادة الإعدادات الافتراضية",
    resetDefaultsDesc: "إعادة جميع الإعدادات لقيمها الأصلية",
    resetButton: "إعادة",
    language: "لغة التطبيق",
    languageDesc: "اختر لغة واجهة التطبيق",
    arabic: "العربية",
    english: "English",
    version: "الإصدار 1.0.0 • جميع البيانات محلية",
    quote: "«وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ»",
    difficulties: [
      { value: "easy", label: "سهل" },
      { value: "medium", label: "متوسط" },
      { value: "hard", label: "صعب" },
    ],
    reciters: [
      { value: "minshawi-murattal", label: "محمد صديق المنشاوي (مرتل)" },
      { value: "husary", label: "الحصري" },
      { value: "minshawi", label: "المنشاوي" },
      { value: "sudais", label: "السديس" },
      { value: "afasy", label: "العفاسي" },
      { value: "ghamdi", label: "الغامدي" },
    ],
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
    settings: "Settings",
    comingSoon: "Soon",
  },
  home: {
    bismillah: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  },
  azkar: {
    title: "Azkar",
    subtitle: "From Sahih al-Adhkar al-Jami' by Sheikh al-Albani, may Allah have mercy on him",
    back: "← Back",
    backToCategories: "← Back to Categories",
    backHome: "← Home",
    done: "✓ Done",
    doneAlt: "Done ✓",
    reset: "↺",
    resetTitle: "Reset counter",
    zikr: "dhikr",
    allDone: "✅ All complete",
    quote: "\"Glorify Allah after every prayer thirty-three times\"",
  },
  quiz: {
    title: "Quizzes",
    subtitle: "Choose a quiz to begin",
    start: "Start Quiz",
    next: "Next Question →",
    finish: "🏁 Finish Quiz",
    backToList: "← Back to List",
    backHome: "← Back to Home",
  },
  quizList: {
    titleHeader: "Available Quizzes",
    subtitleHeader: "الاختبارات المتاحة",
    akmelTitle: "Complete the Verse",
    akmelDesc: "Complete the verse from memory",
    mutashabihatTitle: "Mutashabihat",
    mutashabihatDesc: "Distinguish and complete similar-opening verses",
  },
  quizSetup: {
    akmelTitle: "Complete the Verse",
    akmelSubtitle: "اختبار القرآن — أكمل الآية",
    akmelInfo: "You will be shown the start of a verse and asked to complete it. Choose your scope and number of questions.",
    mutashabihatTitle: "Mutashabihat",
    mutashabihatSubtitle: "اختبار المتشابهات — أكمل الآية المتشابهة",
    mutashabihatInfo: "You'll be shown an opening shared by several similar verses — complete the correct one.",
    scope: "Scope",
    scopeSurah: "Surah",
    scopePages: "Pages",
    scopeJuz: "Juz",
    selectSurah: "Select Surah",
    selectSurahs: "Select Surahs",
    selectJuzs: "Select Juzs",
    pageRange: "Page Range",
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
    backToList: "← Back to List",
  },
  quizTest: {
    questionOf: "Question",
    score: "Score",
    exit: "✕ Exit",
    confirmExit: "Exit the quiz?",
    hint: "💡 Hint",
    context: "📖 Context",
    hide: "📖 Hide",
    submit: "➤ Submit",
    skip: "⏭ Skip",
    promptComplete: "✽ Complete the verse ✽",
    inputPlaceholder: "Type the rest of the verse here…",
    correctMsg: "Correct — well done!",
    skippedMsg: "Skipped",
    wrongMsg: "Incorrect",
    correctAnswer: "Correct answer:",
    completionVerse: "Completion:",
    nextQuestion: "← Next Question",
    finishQuiz: "🏁 Finish Quiz",
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
    errorNoMutashabihat: "No similar verses found in the selected range.\nTry a wider scope.",
    backToSetup: "← Back to Setup",
    ayahLabel: "Ayah",
    pageLabel: "Page",
    hizbLabel: "Hizb",
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
    resetDefaults: "Restore Defaults",
    resetDefaultsDesc: "Reset all settings to their original values",
    resetButton: "Reset",
    language: "App Language",
    languageDesc: "Choose interface language",
    arabic: "العربية",
    english: "English",
    version: "Version 1.0.0 • All data stored locally",
    quote: "«وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ»",
    difficulties: [
      { value: "easy", label: "Easy" },
      { value: "medium", label: "Medium" },
      { value: "hard", label: "Hard" },
    ],
    reciters: [
      { value: "minshawi-murattal", label: "Muhammad Siddiq Al Minshawy (Murattal)" },
      { value: "husary", label: "Al-Husary" },
      { value: "minshawi", label: "Al-Minshawi" },
      { value: "sudais", label: "Al-Sudais" },
      { value: "afasy", label: "Al-Afasy" },
      { value: "ghamdi", label: "Al-Ghamdi" },
    ],
  },
};

export const STRINGS: Record<Lang, AppStrings> = { ar, en };
