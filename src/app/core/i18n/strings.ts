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
    home: string;
    quran: string;
    quiz: string;
    azkar: string;
    ahadith: string;
    hifz: string;
    account: string;
    more: string;
    settings: string;
    comingSoon: string;
  };

  home: {
    bismillah: string;
  };

  /** The "More" hub: secondary destinations that don't earn their own tab. */
  more: {
    title: string;
    account: string;
    settings: string;
    /** One entry covers both: the page shows the qibla above the times. */
    prayerTimes: string;
    tracker: string;
  };

  tracker: {
    title: string;
    menuSettings: string;
    menuInfo: string;
    back: string;
    menu: string;
    /** Screen-reader text on an act that has not opened yet. */
    locked: string;
    viewingPast: string;
    backToToday: string;
    openCalendar: string;
    prevMonth: string;
    nextMonth: string;
    noLocation: string;
    sections: Record<"prayers" | "azkar" | "quran" | "daily" | "rawatib" | "fasting", string>;
    items: Record<string, { title: string; subtitle?: string }>;
    fasting: Record<"ramadan" | "arafah" | "ashura" | "tasua" | "shawwal" | "whiteDays" | "monday" | "thursday", { chip: string; subtitle: string }>;
    fastTodayTitle: string;
    settings: { title: string; question: string; obligatory: string; footnote: string };
    info: {
      subtitle: string;
      purposeTitle: string; purpose: string;
      howTitle: string; how: string[];
      lockedTitle: string; locked: string[];
    };
  };

  prayerTimes: {
    title: string;
    /** The six rows, in display order. */
    fajr: string;
    sunrise: string;
    dhuhr: string;
    /** Dhuhr's name on a Friday. */
    jumuah: string;
    asr: string;
    maghrib: string;
    isha: string;
    /** Supplementary times, shown in their own collapsible section. */
    duha: string;
    midnight: string;
    last_third: string;
    additionalTimes: string;
    nextPrayer: string;
    /** Countdown, e.g. "in 2h 14m" — {time} is substituted. */
    remaining: string;
    method: string;
    madhab: string;
    shafi: string;
    hanafi: string;
    methodEgyptian: string;
    methodUmmAlQura: string;
    methodMwl: string;
    methodKarachi: string;
    methodNorthAmerica: string;
    methodDubai: string;
    methodQatar: string;
    methodKuwait: string;
    methodSingapore: string;
    methodMoonSighting: string;
    locationNeeded: string;
    locationNeededDesc: string;
    grantLocation: string;
    locationDenied: string;
    /** The fix itself did not arrive, though the permission is held. */
    locationFailed: string;
    show: string;
    showDesc: string;
    alwaysShown: string;
    qibla: string;
    qiblaFromNorth: string;
    qiblaNoSensor: string;
    qiblaCalibrate: string;
    prayersTab: string;
    /** Compass turn guidance — shown only when a heading is available. */
    turnLeft: string;
    turnRight: string;
    facingQibla: string;
    /** The location button and its failure states. */
    updateLocation: string;
    locating: string;
    locationServicesOff: string;
    locationServicesOffDesc: string;
    /** Button that asks the launcher to pin the home-screen widget. */
    addWidget: string;
    /** Shown beneath it once at least one copy is already on the home screen. */
    widgetAdded: string;
    /**
     * Shown when the launcher refused the request without prompting — MIUI
     * and some other skins gate widget pinning behind a per-app permission
     * the app cannot request, so the user has to grant it or place the
     * widget by hand.
     */
    widgetBlocked: string;
    /** Opens the app's system settings page, where that permission lives. */
    widgetOpenSettings: string;
    /** Button shown in place of "add" once the widget is on the home screen. */
    widgetShowOnHome: string;
    /** Opens the placed widget's appearance settings. */
    widgetAppearance: string;
    /** The ⋮ menu that gathers the page's settings destinations. */
    menuTitle: string;
    menuLabel: string;
    /** Widget destination: its menu row, and the sheet it opens. */
    widgetSettings: string;
    widgetSettingsDesc: string;
    /** Summary under the widget menu row, standing in for a value. */
    widgetPlacedStatus: string;
    widgetNotPlacedStatus: string;
    /** Calculation destination: method and madhab together. */
    calculationTitle: string;
    calculationDesc: string;
    /** What each picker actually changes, said in the reader's terms. */
    methodHint: string;
    madhabHint: string;
  };

  /** Confirmation shown on the first of the two back swipes that exit the app. */
  exitConfirm: string;

  /** Shown when a feature that needs the network is used while offline. */
  offline: {
    /** Generic message for any online-only action. */
    message: string;
    /** Audio recitation download / streaming. */
    download: string;
    /** Recite mode (needs live speech-to-text). */
    recite: string;
    /** Tafsir fetching. */
    tafsir: string;
    /** Full-text search that needs pages not yet cached. */
    search: string;
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
    favorite: string;
    unfavorite: string;
    play: string;
    pause: string;
    reference: string;
    myAzkarTitle: string;
    myAzkarSubtitle: string;
    myAzkarEmpty: string;
    referenceTitle: string;
    citation: string;
    narrator: string;
    grade: string;
    noOrigin: string;
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
    tabSimple: string;
    tabAdvanced: string;
    yourRanges: string;
    noRangesHint: string;
    addRange: string;
    addPageRange: string;
    savedSets: string;
    saveThisSet: string;
    updateSet: string;
    saveAsNew: string;
    removeRange: string;
    deleteSet: string;
    deletedToast: string;
    undo: string;
    renameSet: string;
    alreadyAdded: string;
    rangeTotals: string;
    pageWord: string;
    othersWord: string;
    juzPlural: string;
    surahPlural: string;
    pagePlural: string;
    perPageMode: string;
    perPageCount: string;
    perPageTotal: string;
    pagesWord: string;
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
    recite: string;
    reciteStop: string;
    reciteListening: string;
    reciteNoMatch: string;
    reciteIdentifying: string;
    reciteRateLimited: string;
    reciteMicError: string;
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
    audioError: string;
    actionSheetTitle: (verseKey: string) => string;
    play: string;
    pause: string;
    tafsir: string;
    tafsirUnavailable: string;
    tafsirLoading: string;
    tafsirError: string;
    tafsirDownloading: string;
    tafsirDownloadFailed: string;
    tafsirIncomplete: string;
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
    sectionSync: string;
    syncLastSynced: string;
    syncNever: string;
    syncNow: string;
    syncRunning: string;
    syncOffline: string;
    syncFailed: string;
    syncTracked: string;
    syncNothingToSync: string;
    syncUpToDate: string;
    syncToday: string;
    syncYesterday: string;
    syncDaysAgo: (n: number) => string;
    syncOverdue: string;
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
    streakInfoTitle: string;
    streakInfoBody: (n: number) => string;
    streakInfoOk: string;
    streakRecoverAvailable: (n: number) => string;
    streakRecoverNeeded: (n: number) => string;
    openInQuran: string;
    quizFromSession: string;
    sessionPrevious: string;
    viewAllSessions: string;
    sessionsAll: string;
    daysActive: string;
    todaySessions: string;
    bestPlan: string;
    latestPlan: string;
    sessionsWord: string;
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
    home: "الرئيسية",
    quran: "القرآن",
    quiz: "اختبارات",
    azkar: "أذكار",
    ahadith: "أحاديث",
    hifz: "الحفظ",
    account: "حسابي",
    more: "المزيد",
    settings: "إعدادات",
    comingSoon: "قريباً...",
  },
  home: {
    bismillah: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  },
  more: {
    title: "المزيد",
    account: "حسابي",
    settings: "الإعدادات",
    prayerTimes: "المواقيت والقبلة",
    tracker: "متابعة العبادات",
  },
  tracker: {
    title: "متابعة العبادات",
    menuSettings: "إعدادات متابعة العبادات",
    menuInfo: "كيف تعمل؟",
    back: "رجوع",
    menu: "المزيد من الخيارات",
    locked: "مقفلة حتى دخول وقتها",
    viewingPast: "تعرض بيانات يوم سابق",
    backToToday: "العودة لليوم",
    openCalendar: "اختيار يوم من التقويم",
    prevMonth: "الشهر السابق",
    nextMonth: "الشهر التالي",
    noLocation: "حدّد موقعك في المواقيت لتُفتح العبادات في أوقاتها",
    sections: {
      prayers: "الصلوات", azkar: "الأذكار", quran: "القرآن الكريم",
      daily: "عبادات يومية", rawatib: "سنن رواتب", fasting: "الصيام",
    },
    items: {
      fajr: { title: "الفجر" }, dhuhr: { title: "الظهر" }, asr: { title: "العصر" },
      maghrib: { title: "المغرب" }, isha: { title: "العشاء" },
      azkarMorning: { title: "أذكار الصباح" },
      azkarEvening: { title: "أذكار المساء" },
      azkarSleep: { title: "أذكار النوم" },
      quranDaily: { title: "قراءة القرآن", subtitle: "ورد يومي من القرآن الكريم" },
      duha: { title: "صلاة الضحى", subtitle: "من 2 إلى 8 ركعات بعد شروق الشمس" },
      sunnahFajr: { title: "سنة الفجر", subtitle: "ركعتان قبل صلاة الفجر" },
      sunnahDhuhrBefore: { title: "سنة الظهر القبلية", subtitle: "4 ركعات قبل صلاة الظهر" },
      sunnahDhuhrAfter: { title: "سنة الظهر البعدية", subtitle: "ركعتان بعد صلاة الظهر" },
      sunnahMaghrib: { title: "سنة المغرب", subtitle: "ركعتان بعد صلاة المغرب" },
      sunnahIsha: { title: "سنة العشاء", subtitle: "ركعتان بعد صلاة العشاء" },
      qiyam: { title: "قيام الليل", subtitle: "من بعد صلاة العشاء حتى طلوع الفجر" },
      witr: { title: "صلاة الوتر", subtitle: "ركعة أو ثلاث أو خمس أو سبع أو إحدى عشرة" },
    },
    fastTodayTitle: "صمت اليوم",
    fasting: {
      ramadan: { chip: "رمضان", subtitle: "صيام شهر رمضان" },
      arafah: { chip: "يوم عرفة", subtitle: "صيام يوم عرفة" },
      ashura: { chip: "عاشوراء", subtitle: "صيام يوم عاشوراء" },
      tasua: { chip: "تاسوعاء", subtitle: "صيام اليوم التاسع من محرم" },
      shawwal: { chip: "ست من شوال", subtitle: "صيام الست من شوال" },
      whiteDays: { chip: "الأيام البيض", subtitle: "صيام الأيام البيض" },
      monday: { chip: "الاثنين", subtitle: "صيام يوم الاثنين" },
      thursday: { chip: "الخميس", subtitle: "صيام يوم الخميس" },
    },
    settings: {
      title: "إعدادات متابعة العبادات",
      question: "ما الذي يُحتسب في نسبة الإنجاز؟",
      obligatory: "إلزامي",
      footnote: "الصلوات الخمس تُحتسب دائماً بنسبة 50٪، والأقسام المفعّلة تتقاسم الـ 50٪ المتبقية بالتساوي.",
    },
    info: {
      subtitle: "تابع عباداتك اليومية وحافظ على استمرارك",
      purposeTitle: "وسيلة تنظيمية",
      purpose: "خاصية المتابعة وسيلة تنظيمية تساعدك على الالتزام بالفرائض والسنن، وليست عبادة بذاتها ولا سنة عن النبي ﷺ؛ فاجعلها سراً بينك وبين الله، لا لجمع «الدرجات» ولا للمفاخرة أو الرياء.",
      howTitle: "كيف تستخدمها؟",
      how: [
        "اضغط على أي عبادة لتسجيل إتمامها، واضغط مرة أخرى للتراجع",
        "اضغط مطولاً على الأذكار لفتح صفحة القراءة، وعلى القرآن أو سورة الكهف لفتحها مباشرة",
        "يتم إعادة التعيين تلقائياً كل يوم عند الفجر",
      ],
      lockedTitle: "العبادات المقيّدة بالوقت",
      locked: [
        "لا يمكن تسجيل الصلاة أو سنتها الراتبة قبل دخول وقتها",
        "الأذكار والنوافل تُفتح بعد وقتها المسنون",
      ],
    },
  },
  prayerTimes: {
    title: "مواقيت الصلاة",
    fajr: "الفجر",
    sunrise: "الشروق",
    dhuhr: "الظهر",
    jumuah: "الجمعة",
    asr: "العصر",
    maghrib: "المغرب",
    isha: "العشاء",
    duha: "الضحى",
    midnight: "منتصف الليل",
    last_third: "الثلث الأخير",
    additionalTimes: "أوقات إضافية",
    nextPrayer: "الصلاة القادمة",
    remaining: "بعد {time}",
    method: "طريقة الحساب",
    madhab: "المذهب",
    shafi: "الشافعي",
    hanafi: "الحنفي",
    methodEgyptian: "الهيئة المصرية العامة للمساحة",
    methodUmmAlQura: "أم القرى - مكة المكرمة",
    methodMwl: "رابطة العالم الإسلامي",
    methodKarachi: "جامعة العلوم الإسلامية - كراتشي",
    methodNorthAmerica: "الجمعية الإسلامية لأمريكا الشمالية",
    methodDubai: "دبي",
    methodQatar: "قطر",
    methodKuwait: "الكويت",
    methodSingapore: "سنغافورة",
    methodMoonSighting: "هيئة رؤية الهلال",
    locationNeeded: "حدّد موقعك",
    locationNeededDesc: "نحتاج إلى موقعك لحساب مواقيت الصلاة. يبقى الموقع على جهازك ولا يُرسَل إلى أي جهة.",
    grantLocation: "تحديد الموقع",
    locationDenied: "تعذّر تحديد الموقع. يمكنك السماح بذلك من إعدادات التطبيق.",
    locationFailed: "تعذّر الحصول على الموقع. حاول مرة أخرى في مكان مكشوف.",
    show: "الأوقات المعروضة",
    showDesc: "اختر ما يظهر في القائمة",
    alwaysShown: "دائماً",
    qibla: "القبلة",
    qiblaFromNorth: "{deg}° من الشمال",
    qiblaNoSensor: "لا تتوفر بوصلة في هذا الجهاز. اتجاه القبلة من الشمال مذكور أعلاه.",
    qiblaCalibrate: "حرّك الجهاز على شكل رقم ٨ لمعايرة البوصلة",
    prayersTab: "الصلوات",
    turnLeft: "استدر يساراً",
    turnRight: "استدر يميناً",
    facingQibla: "أنت تواجه القبلة",
    updateLocation: "تحديث الموقع",
    locating: "جارٍ تحديد الموقع…",
    locationServicesOff: "خدمات الموقع متوقفة",
    locationServicesOffDesc: "شغّل خدمات الموقع في إعدادات الجهاز ثم حاول مرة أخرى.",
    addWidget: "إضافة الأداة إلى الشاشة الرئيسية",
    widgetAdded: "الأداة مضافة بالفعل",
    widgetBlocked:
      "تعذّرت إضافة الأداة عبر المشغّل. تأكد من السماح بـ«اختصارات الشاشة الرئيسية» في إعدادات التطبيق، أو أضف الأداة بالضغط المطوّل على الشاشة الرئيسية.",
    widgetOpenSettings: "فتح إعدادات التطبيق",
    widgetShowOnHome: "عرض الأداة على الشاشة الرئيسية",
    widgetAppearance: "مظهر الأداة",
    menuTitle: "الخيارات",
    menuLabel: "خيارات مواقيت الصلاة",
    widgetSettings: "إعدادات الأداة",
    widgetSettingsDesc: "أداة المواقيت على الشاشة الرئيسية",
    widgetPlacedStatus: "مضافة إلى الشاشة الرئيسية",
    widgetNotPlacedStatus: "غير مضافة بعد",
    calculationTitle: "طريقة الحساب والمذهب",
    calculationDesc: "تؤثر على المواقيت المعروضة",
    methodHint:
      "تختلف الهيئات في زاويتي الفجر والعشاء. اختر الهيئة المعتمدة في بلدك.",
    madhabHint: "يؤخّر المذهب الحنفي وقت العصر عن الشافعي.",
  },
  exitConfirm: "اسحب مرة أخرى للخروج",
  offline: {
    message: "هذه الميزة تتطلب الاتصال بالإنترنت",
    download: "تحميل التلاوات يتطلب الاتصال بالإنترنت",
    recite: "وضع التسميع يتطلب الاتصال بالإنترنت",
    tafsir: "التفسير يتطلب الاتصال بالإنترنت",
    search: "البحث في هذه الصفحات يتطلب الاتصال بالإنترنت",
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
    favorite: "إضافة إلى أذكاري",
    unfavorite: "إزالة من أذكاري",
    play: "تشغيل",
    pause: "إيقاف",
    reference: "أصل الذكر",
    myAzkarTitle: "أذكاري",
    myAzkarSubtitle: "الأذكار التي أضفتها إلى المفضلة",
    myAzkarEmpty: "لم تُضف أي ذكر بعد. اضغط ☆ على أي ذكر لإضافته هنا.",
    referenceTitle: "أصل الذكر",
    citation: "المصدر",
    narrator: "الراوي",
    grade: "الحكم والتخريج",
    noOrigin: "لم يُضف نص الحديث لهذا الذكر بعد.",
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
    tabSimple: "بسيط",
    tabAdvanced: "متقدم",
    yourRanges: "نطاقاتك",
    noRangesHint: "أضف جزءًا أو سورة أو نطاق صفحات لبدء بناء اختبارك",
    addRange: "أضف نطاقًا",
    addPageRange: "أضف النطاق",
    savedSets: "المجموعات المحفوظة",
    saveThisSet: "احفظ هذه المجموعة",
    updateSet: "تحديث",
    saveAsNew: "حفظ كجديدة",
    removeRange: "إزالة النطاق",
    deleteSet: "حذف",
    deletedToast: "تم الحذف",
    undo: "تراجع",
    renameSet: "إعادة التسمية",
    alreadyAdded: "مُضاف بالفعل",
    rangeTotals: "الإجمالي",
    pageWord: "ص",
    othersWord: "أخرى",
    juzPlural: "أجزاء",
    surahPlural: "سور",
    pagePlural: "نطاقات صفحات",
    perPageMode: "أسئلة لكل صفحة",
    perPageCount: "عدد الأسئلة لكل صفحة",
    perPageTotal: "إجمالي الأسئلة",
    pagesWord: "صفحة",
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
    recite: "تلاوة",
    reciteStop: "إيقاف",
    reciteListening: "أستمع… تابع التلاوة",
    reciteNoMatch: "لم يتم التعرف على كلامك، حاول مجدداً",
    reciteIdentifying: "جاري الاستماع…",
    reciteRateLimited: "تم إبطاء الاستماع مؤقتًا…",
    reciteMicError: "تعذّر الوصول إلى الميكروفون",
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
    audioError: "تعذر تشغيل الصوت",
    actionSheetTitle: (verseKey: string) => `الآية ${verseKey}`,
    play: "تشغيل",
    pause: "إيقاف",
    tafsir: "التفسير",
    tafsirUnavailable: "التفسير غير متوفر بعد",
    tafsirLoading: "جاري تحميل التفسير…",
    tafsirError: "تعذر تحميل التفسير",
    tafsirDownloading: "جاري التنزيل…",
    tafsirDownloadFailed: "تعذّر التنزيل",
    tafsirIncomplete: "التنزيل غير مكتمل",
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
    sectionSync: "المحتوى دون اتصال",
    syncLastSynced: "آخر مزامنة",
    syncNever: "لم تتم المزامنة بعد",
    syncNow: "مزامنة الآن",
    syncRunning: "جاري المزامنة…",
    syncOffline: "دون اتصال — ستتم المزامنة عند الاتصال",
    syncFailed: "تعذّرت المزامنة",
    syncTracked: "المصادر المتتبَّعة",
    syncNothingToSync: "لا يوجد محتوى محفوظ للمزامنة بعد",
    syncUpToDate: "المحتوى مُحدَّث",
    syncToday: "اليوم",
    syncYesterday: "أمس",
    syncDaysAgo: (n: number) => `قبل ${n} يوم`,
    syncOverdue: "المحتوى بحاجة إلى مزامنة",
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
    prayerRemindersDesc: "تنبيه عند دخول وقت كل صلاة",
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
    streakInfoTitle: "سلسلة المواظبة",
    streakInfoBody: (n) =>
      `حافظ على سلسلتك بإتمام جلسة واحدة على الأقل كل يوم. إذا فاتك يوم، يمكنك استعادة السلسلة بإكمال ${n} جلسات في اليوم التالي.`,
    streakInfoOk: "حسنًا",
    streakRecoverAvailable: (n) =>
      `فاتك يوم أمس! أكمل ${n} جلسات اليوم لاستعادة سلسلتك ومتابعتها.`,
    streakRecoverNeeded: (n) =>
      n === 1 ? "بقيت جلسة واحدة لاستعادة السلسلة." : `بقيت ${n} جلسات لاستعادة السلسلة.`,
    openInQuran: "افتح في القرآن",
    quizFromSession: "اختبر نفسك",
    sessionPrevious: "السابقة",
    viewAllSessions: "عرض جميع الجلسات",
    sessionsAll: "جميع الجلسات",
    daysActive: "أيام منذ البداية",
    todaySessions: "جلسة اليوم",
    bestPlan: "أفضل جولة",
    latestPlan: "آخر جولة",
    sessionsWord: "جلسة",
    bestPlanDays: "يوم",
    bestPlanPages: "ص",
    bestPlanNone: "لا يوجد بعد",
    heroToday: "جلسات اليوم",
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
    home: "Home",
    quran: "Quran",
    quiz: "Quizzes",
    azkar: "Azkar",
    ahadith: "Ahadith",
    hifz: "Hifz",
    account: "Account",
    more: "More",
    settings: "Settings",
    comingSoon: "Coming soon...",
  },
  home: {
    bismillah: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  },
  more: {
    title: "More",
    account: "Account",
    settings: "Settings",
    prayerTimes: "Prayer Times & Qibla",
    tracker: "Worship Tracker",
  },
  tracker: {
    title: "Worship Tracker",
    menuSettings: "Tracker settings",
    menuInfo: "How it works",
    back: "Back",
    menu: "More options",
    locked: "Locked until its time begins",
    viewingPast: "Viewing a past day",
    backToToday: "Back to today",
    openCalendar: "Pick a day from the calendar",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    noLocation: "Set your location in Prayer Times so acts unlock at their times",
    sections: {
      prayers: "Prayers", azkar: "Azkar", quran: "The Quran",
      daily: "Daily worship", rawatib: "Sunnah prayers", fasting: "Fasting",
    },
    items: {
      fajr: { title: "Fajr" }, dhuhr: { title: "Dhuhr" }, asr: { title: "Asr" },
      maghrib: { title: "Maghrib" }, isha: { title: "Isha" },
      azkarMorning: { title: "Morning azkar" },
      azkarEvening: { title: "Evening azkar" },
      azkarSleep: { title: "Sleep azkar" },
      quranDaily: { title: "Quran reading", subtitle: "A daily portion of the Quran" },
      duha: { title: "Duha prayer", subtitle: "2 to 8 rak'ahs after sunrise" },
      sunnahFajr: { title: "Fajr sunnah", subtitle: "2 rak'ahs before Fajr" },
      sunnahDhuhrBefore: { title: "Dhuhr sunnah (before)", subtitle: "4 rak'ahs before Dhuhr" },
      sunnahDhuhrAfter: { title: "Dhuhr sunnah (after)", subtitle: "2 rak'ahs after Dhuhr" },
      sunnahMaghrib: { title: "Maghrib sunnah", subtitle: "2 rak'ahs after Maghrib" },
      sunnahIsha: { title: "Isha sunnah", subtitle: "2 rak'ahs after Isha" },
      qiyam: { title: "Qiyam al-Layl", subtitle: "From after Isha until Fajr" },
      witr: { title: "Witr", subtitle: "1, 3, 5, 7 or 11 rak'ahs" },
    },
    fastTodayTitle: "I fasted today",
    fasting: {
      ramadan: { chip: "Ramadan", subtitle: "Fasting the month of Ramadan" },
      arafah: { chip: "Day of Arafah", subtitle: "Fasting the Day of Arafah" },
      ashura: { chip: "Ashura", subtitle: "Fasting the Day of Ashura" },
      tasua: { chip: "Tasu'a", subtitle: "Fasting the 9th of Muharram" },
      shawwal: { chip: "Six of Shawwal", subtitle: "Fasting six days of Shawwal" },
      whiteDays: { chip: "White Days", subtitle: "Fasting the White Days" },
      monday: { chip: "Monday", subtitle: "Fasting on Monday" },
      thursday: { chip: "Thursday", subtitle: "Fasting on Thursday" },
    },
    settings: {
      title: "Tracker settings",
      question: "What counts toward completion?",
      obligatory: "Required",
      footnote: "The five prayers always count for 50%. Enabled sections share the remaining 50% equally.",
    },
    info: {
      subtitle: "Track your daily worship and stay consistent",
      purposeTitle: "An organising aid",
      purpose: "Tracking is an aid to help you keep up with obligatory and sunnah acts. It is not an act of worship in itself, nor a sunnah of the Prophet ﷺ. Keep it between you and Allah, not for collecting points, boasting or showing off.",
      howTitle: "How to use it",
      how: [
        "Tap any act to mark it done, and tap again to undo",
        "Long-press azkar to open them, or the Quran to open it (Surah Al-Kahf on Fridays)",
        "Everything resets automatically each day at Fajr",
      ],
      lockedTitle: "Time-bound acts",
      locked: [
        "A prayer or its sunnah can't be logged before its time begins",
        "Azkar and voluntary prayers open at their recommended times",
      ],
    },
  },
  prayerTimes: {
    title: "Prayer Times",
    fajr: "Fajr",
    sunrise: "Sunrise",
    dhuhr: "Dhuhr",
    jumuah: "Jumu'ah",
    asr: "Asr",
    maghrib: "Maghrib",
    isha: "Isha",
    duha: "Duha",
    midnight: "Midnight",
    last_third: "Last third",
    additionalTimes: "Additional times",
    nextPrayer: "Next prayer",
    remaining: "in {time}",
    method: "Calculation method",
    madhab: "Madhab",
    shafi: "Shafi",
    hanafi: "Hanafi",
    methodEgyptian: "Egyptian General Authority of Survey",
    methodUmmAlQura: "Umm al-Qura, Makkah",
    methodMwl: "Muslim World League",
    methodKarachi: "University of Islamic Sciences, Karachi",
    methodNorthAmerica: "Islamic Society of North America",
    methodDubai: "Dubai",
    methodQatar: "Qatar",
    methodKuwait: "Kuwait",
    methodSingapore: "Singapore",
    methodMoonSighting: "Moonsighting Committee",
    locationNeeded: "Set your location",
    locationNeededDesc: "Prayer times are calculated from your location. It stays on your device and is never sent anywhere.",
    grantLocation: "Use my location",
    locationDenied: "Could not get your location. You can allow it in the app's settings.",
    locationFailed: "Could not get a location fix. Try again somewhere with a clearer view of the sky.",
    show: "Shown times",
    showDesc: "Choose what appears in the list",
    alwaysShown: "Always",
    qibla: "Qibla",
    qiblaFromNorth: "{deg}° from north",
    qiblaNoSensor: "This device has no compass. The bearing from north is shown above.",
    qiblaCalibrate: "Move the device in a figure eight to calibrate the compass",
    prayersTab: "Prayers",
    turnLeft: "Turn left",
    turnRight: "Turn right",
    facingQibla: "Facing the qibla",
    updateLocation: "Update location",
    locating: "Finding your location…",
    locationServicesOff: "Location services are off",
    locationServicesOffDesc: "Turn on location in your device settings, then try again.",
    addWidget: "Add widget to home screen",
    widgetAdded: "Widget already added",
    widgetBlocked:
      "Your launcher would not add the widget. Check that “Home screen shortcuts” is allowed in app settings, or add the widget by long-pressing the home screen.",
    widgetOpenSettings: "Open app settings",
    widgetShowOnHome: "Show widget on home screen",
    widgetAppearance: "Widget appearance",
    menuTitle: "Options",
    menuLabel: "Prayer times options",
    widgetSettings: "Widget settings",
    widgetSettingsDesc: "The prayer times widget on your home screen",
    widgetPlacedStatus: "On your home screen",
    widgetNotPlacedStatus: "Not added yet",
    calculationTitle: "Calculation and madhab",
    calculationDesc: "Changes the times shown",
    methodHint:
      "Authorities differ on the sun angles for Fajr and Isha. Pick the one used where you are.",
    madhabHint: "The Hanafi madhab sets Asr later than the Shafi'i.",
  },
  exitConfirm: "Swipe again to exit",
  offline: {
    message: "This feature is only available when connected to the Internet",
    download: "Downloading recitations requires an Internet connection",
    recite: "Recite mode requires an Internet connection",
    tafsir: "Tafsir requires an Internet connection",
    search: "Searching these pages requires an Internet connection",
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
    favorite: "Add to My Azkar",
    unfavorite: "Remove from My Azkar",
    play: "Play",
    pause: "Pause",
    reference: "Origin",
    myAzkarTitle: "My Azkar",
    myAzkarSubtitle: "The adhkar you have favourited",
    myAzkarEmpty: "Nothing here yet. Tap ☆ on any dhikr to add it.",
    referenceTitle: "Origin of the Dhikr",
    citation: "Source",
    narrator: "Narrator",
    grade: "Grade & collection",
    noOrigin: "The hadith text for this dhikr has not been added yet.",
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
    tabSimple: "Simple",
    tabAdvanced: "Advanced",
    yourRanges: "Your ranges",
    noRangesHint: "Add a juz, surah or page range to start building your quiz",
    addRange: "Add a range",
    addPageRange: "Add range",
    savedSets: "Saved sets",
    saveThisSet: "Save this set",
    updateSet: "Update",
    saveAsNew: "Save as new",
    removeRange: "Remove range",
    deleteSet: "Delete",
    deletedToast: "Deleted",
    undo: "Undo",
    renameSet: "Rename",
    alreadyAdded: "Already added",
    rangeTotals: "Total",
    pageWord: "p.",
    othersWord: "others",
    juzPlural: "juz",
    surahPlural: "surahs",
    pagePlural: "page ranges",
    perPageMode: "Questions per page",
    perPageCount: "Questions for each page",
    perPageTotal: "Total questions",
    pagesWord: "pages",
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
    recite: "Recite",
    reciteStop: "Stop",
    reciteListening: "Listening… keep reciting",
    reciteNoMatch: "Didn't catch that — try again",
    reciteIdentifying: "Listening…",
    reciteRateLimited: "Slowing down temporarily…",
    reciteMicError: "Couldn't access the microphone",
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
    audioError: "Could not play audio",
    actionSheetTitle: (verseKey: string) => `Verse ${verseKey}`,
    play: "Play",
    pause: "Pause",
    tafsir: "Tafsir",
    tafsirUnavailable: "Tafsir is not available yet",
    tafsirLoading: "Loading tafsir…",
    tafsirError: "Could not load tafsir",
    tafsirDownloading: "Downloading…",
    tafsirDownloadFailed: "Download failed",
    tafsirIncomplete: "Download incomplete",
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
    sectionSync: "Offline content",
    syncLastSynced: "Last synced",
    syncNever: "Not synced yet",
    syncNow: "Sync now",
    syncRunning: "Syncing…",
    syncOffline: "Offline — will sync when connected",
    syncFailed: "Sync failed",
    syncTracked: "Tracked sources",
    syncNothingToSync: "No saved content to sync yet",
    syncUpToDate: "Content is up to date",
    syncToday: "Today",
    syncYesterday: "Yesterday",
    syncDaysAgo: (n: number) => `${n} days ago`,
    syncOverdue: "Content is due a sync",
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
    prayerRemindersDesc: "A notification when each prayer time begins",
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
    streakInfoTitle: "Streak",
    streakInfoBody: (n) =>
      `Keep your streak by completing at least one session every day. If you miss a day, you can win the streak back by completing ${n} sessions the next day.`,
    streakInfoOk: "Got it",
    streakRecoverAvailable: (n) =>
      `You missed yesterday! Complete ${n} sessions today to recover your streak and keep it going.`,
    streakRecoverNeeded: (n) =>
      n === 1 ? "1 more session to recover your streak." : `${n} more sessions to recover your streak.`,
    openInQuran: "Open in Quran",
    quizFromSession: "Quiz yourself",
    sessionPrevious: "Previous",
    viewAllSessions: "View All Sessions",
    sessionsAll: "All Sessions",
    daysActive: "Days Since Start",
    todaySessions: "today",
    bestPlan: "Best Round",
    latestPlan: "Last Round",
    sessionsWord: "sessions",
    bestPlanDays: "d",
    bestPlanPages: "pg",
    bestPlanNone: "None yet",
    heroToday: "Sessions Today",
    heroBestDay: "Best Day",
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
