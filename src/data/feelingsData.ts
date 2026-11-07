/**
 * FEELINGS — verses and duas by how the user feels.
 *
 * Content rules:
 *  - Every dua has a source. Reused duas point at an entry in azkarData.ts
 *    (al-Albani's "جامع صحيح الأذكار") by (categoryId, zikrId) — zikr ids repeat
 *    across categories, so the pair is the key. Inline duas carry their own
 *    source and must not be graded weak by al-Albani.
 *  - Verse text is never typed here: `verses` holds refs only ("13:28" or a
 *    range inside one surah, "94:5-6"). Their text and mushaf page come from
 *    feelingsVerses.generated.ts — re-run scripts/generate-feeling-verses.mjs
 *    after changing any ref.
 *  - `id` is the URL slug (/feelings/:id). Array order is grid order.
 */

export type FeelingDua =
  | { categoryId: string; zikrId: string }
  | { text: string; source: string; note?: string };

export interface Feeling {
  id: string;
  emoji: string;
  titleAr: string;
  titleEn: string;
  verses: string[];
  duas: FeelingDua[];
}

export const FEELINGS: Feeling[] = [
  {
    id: "sad",
    emoji: "😢",
    titleAr: "الحزن والهم",
    titleEn: "Sad & worried",
    verses: ["9:40", "12:86", "94:5-6", "3:139"],
    duas: [
      { categoryId: "distress", zikrId: "ds-8" },
      { categoryId: "distress", zikrId: "mo-9" },
      { categoryId: "distress", zikrId: "ds-2" },
      { categoryId: "distress", zikrId: "ds-4" },
    ],
  },
  {
    id: "anxious",
    emoji: "😟",
    titleAr: "القلق",
    titleEn: "Anxious",
    verses: ["13:28", "65:2-3", "2:286"],
    duas: [
      { categoryId: "distress", zikrId: "ds-5" },
      { categoryId: "distress", zikrId: "ds-1" },
      { categoryId: "distress", zikrId: "ds-10" },
    ],
  },
  {
    id: "afraid",
    emoji: "😨",
    titleAr: "الخوف",
    titleEn: "Afraid",
    verses: ["3:173", "20:46", "9:51"],
    duas: [
      { categoryId: "fear", zikrId: "fe-1" },
      { categoryId: "fear", zikrId: "fe-2" },
      { categoryId: "fear", zikrId: "fe-3" },
      { categoryId: "morning", zikrId: "me-6" },
    ],
  },
  {
    id: "angry",
    emoji: "😠",
    titleAr: "الغضب",
    titleEn: "Angry",
    verses: ["3:134", "42:37", "7:200"],
    duas: [
      { categoryId: "sneezing", zikrId: "sn-4" },
      { categoryId: "salah", zikrId: "sp-19" },
    ],
  },
  {
    id: "confused",
    emoji: "😕",
    titleAr: "الحيرة",
    titleEn: "Confused",
    verses: ["65:2", "2:216", "3:159"],
    duas: [
      { categoryId: "istikhara", zikrId: "is-1" },
      { text: "اللَّهُمَّ اهْدِنِي وَسَدِّدْنِي", source: "صحيح مسلم 2725" },
    ],
  },
  {
    id: "weak-faith",
    emoji: "😔",
    titleAr: "ضعف الإيمان",
    titleEn: "Weak faith",
    verses: ["57:16", "8:2", "3:8"],
    duas: [
      {
        text: "يَا مُقَلِّبَ الْقُلُوبِ ثَبِّتْ قَلْبِي عَلَى دِينِكَ",
        note: "كان أكثر دعاء النبي ﷺ",
        source: "صحيح الترمذي 2140",
      },
      {
        text: "اللَّهُمَّ مُصَرِّفَ الْقُلُوبِ صَرِّفْ قُلُوبَنَا عَلَى طَاعَتِكَ",
        source: "صحيح مسلم 2654",
      },
    ],
  },
  {
    id: "sick",
    emoji: "🤒",
    titleAr: "المرض والرقية",
    titleEn: "Sick",
    verses: ["26:80", "17:82", "21:83-84"],
    duas: [
      { categoryId: "illness", zikrId: "il-7" },
      { categoryId: "illness", zikrId: "il-1" },
      { categoryId: "illness", zikrId: "il-2" },
      { categoryId: "illness", zikrId: "il-8" },
    ],
  },
  {
    id: "impatient",
    emoji: "😤",
    titleAr: "نفاد الصبر",
    titleEn: "Impatient",
    verses: ["2:153", "2:155-157", "39:10", "16:127"],
    duas: [{ categoryId: "funeral", zikrId: "fn-1" }],
  },
  {
    id: "happy",
    emoji: "😊",
    titleAr: "السعادة",
    titleEn: "Happy",
    verses: ["14:7", "10:58", "93:11", "27:19"],
    duas: [
      { categoryId: "social", zikrId: "so-10" },
      { categoryId: "after-prayer", zikrId: "ap-9" },
    ],
  },
  {
    id: "content",
    emoji: "😌",
    titleAr: "الرضا والطمأنينة",
    titleEn: "Content & at peace",
    verses: ["89:27-30", "98:8", "9:59"],
    duas: [
      { categoryId: "morning", zikrId: "mo-1" },
      { categoryId: "salah", zikrId: "sp-19" },
    ],
  },
  {
    id: "love",
    emoji: "🥰",
    titleAr: "الحب",
    titleEn: "Love",
    verses: ["3:31", "2:165", "30:21"],
    duas: [
      {
        text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ حُبَّكَ، وَحُبَّ مَنْ يُحِبُّكَ، وَحُبَّ عَمَلٍ يُقَرِّبُ إِلَى حُبِّكَ",
        note: "من حديث معاذ في اختصام الملأ الأعلى",
        source: "صحيح الترمذي 3235",
      },
      { categoryId: "social", zikrId: "so-2" },
    ],
  },
  {
    id: "lazy",
    emoji: "😩",
    titleAr: "الكسل والضعف",
    titleEn: "Lazy & low",
    verses: ["29:69", "94:7-8", "3:139"],
    duas: [
      { categoryId: "distress", zikrId: "mo-9" },
      { categoryId: "distress", zikrId: "ds-10" },
      {
        text: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْعَجْزِ وَالْكَسَلِ، وَالْجُبْنِ وَالْبُخْلِ، وَالْهَرَمِ وَعَذَابِ الْقَبْرِ، اللَّهُمَّ آتِ نَفْسِي تَقْوَاهَا، وَزَكِّهَا أَنْتَ خَيْرُ مَنْ زَكَّاهَا، أَنْتَ وَلِيُّهَا وَمَوْلَاهَا",
        source: "صحيح مسلم 2722",
      },
    ],
  },
];
