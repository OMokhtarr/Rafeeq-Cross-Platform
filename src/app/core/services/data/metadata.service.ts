import { fetchChapters, fetchJuzs } from "../api/quran-data-provider";
import { idb } from "../storage/idb.service";

export interface PageStart {
  sura: number;
  aya: number;
}

// ─── Static fallback ─────────────────────────────────────────────────────────
const PAGE_STARTS: readonly PageStart[] = [
  { sura: 0, aya: 0 },
  { sura: 1, aya: 1 },
  { sura: 2, aya: 1 },
  { sura: 2, aya: 6 },
  { sura: 2, aya: 17 },
  { sura: 2, aya: 25 },
  { sura: 2, aya: 30 },
  { sura: 2, aya: 38 },
  { sura: 2, aya: 49 },
  { sura: 2, aya: 58 },
  { sura: 2, aya: 62 },
  { sura: 2, aya: 70 },
  { sura: 2, aya: 77 },
  { sura: 2, aya: 84 },
  { sura: 2, aya: 89 },
  { sura: 2, aya: 94 },
  { sura: 2, aya: 102 },
  { sura: 2, aya: 106 },
  { sura: 2, aya: 113 },
  { sura: 2, aya: 120 },
  { sura: 2, aya: 127 },
  { sura: 2, aya: 135 },
  { sura: 2, aya: 142 },
  { sura: 2, aya: 146 },
  { sura: 2, aya: 154 },
  { sura: 2, aya: 164 },
  { sura: 2, aya: 170 },
  { sura: 2, aya: 177 },
  { sura: 2, aya: 182 },
  { sura: 2, aya: 187 },
  { sura: 2, aya: 191 },
  { sura: 2, aya: 197 },
  { sura: 2, aya: 203 },
  { sura: 2, aya: 211 },
  { sura: 2, aya: 216 },
  { sura: 2, aya: 220 },
  { sura: 2, aya: 225 },
  { sura: 2, aya: 231 },
  { sura: 2, aya: 234 },
  { sura: 2, aya: 238 },
  { sura: 2, aya: 246 },
  { sura: 2, aya: 249 },
  { sura: 2, aya: 253 },
  { sura: 2, aya: 257 },
  { sura: 2, aya: 260 },
  { sura: 2, aya: 265 },
  { sura: 2, aya: 270 },
  { sura: 2, aya: 275 },
  { sura: 2, aya: 282 },
  { sura: 2, aya: 283 },
  { sura: 3, aya: 1 },
  { sura: 3, aya: 10 },
  { sura: 3, aya: 16 },
  { sura: 3, aya: 23 },
  { sura: 3, aya: 30 },
  { sura: 3, aya: 38 },
  { sura: 3, aya: 46 },
  { sura: 3, aya: 53 },
  { sura: 3, aya: 62 },
  { sura: 3, aya: 71 },
  { sura: 3, aya: 78 },
  { sura: 3, aya: 84 },
  { sura: 3, aya: 92 },
  { sura: 3, aya: 101 },
  { sura: 3, aya: 109 },
  { sura: 3, aya: 116 },
  { sura: 3, aya: 122 },
  { sura: 3, aya: 133 },
  { sura: 3, aya: 141 },
  { sura: 3, aya: 149 },
  { sura: 3, aya: 154 },
  { sura: 3, aya: 158 },
  { sura: 3, aya: 166 },
  { sura: 3, aya: 174 },
  { sura: 3, aya: 181 },
  { sura: 3, aya: 187 },
  { sura: 3, aya: 195 },
  { sura: 4, aya: 1 },
  { sura: 4, aya: 7 },
  { sura: 4, aya: 12 },
  { sura: 4, aya: 15 },
  { sura: 4, aya: 20 },
  { sura: 4, aya: 24 },
  { sura: 4, aya: 27 },
  { sura: 4, aya: 34 },
  { sura: 4, aya: 38 },
  { sura: 4, aya: 45 },
  { sura: 4, aya: 52 },
  { sura: 4, aya: 60 },
  { sura: 4, aya: 66 },
  { sura: 4, aya: 75 },
  { sura: 4, aya: 80 },
  { sura: 4, aya: 87 },
  { sura: 4, aya: 92 },
  { sura: 4, aya: 95 },
  { sura: 4, aya: 102 },
  { sura: 4, aya: 106 },
  { sura: 4, aya: 114 },
  { sura: 4, aya: 122 },
  { sura: 4, aya: 128 },
  { sura: 4, aya: 135 },
  { sura: 4, aya: 141 },
  { sura: 4, aya: 148 },
  { sura: 4, aya: 155 },
  { sura: 4, aya: 163 },
  { sura: 4, aya: 171 },
  { sura: 4, aya: 176 },
  { sura: 5, aya: 3 },
  { sura: 5, aya: 6 },
  { sura: 5, aya: 10 },
  { sura: 5, aya: 14 },
  { sura: 5, aya: 18 },
  { sura: 5, aya: 24 },
  { sura: 5, aya: 32 },
  { sura: 5, aya: 37 },
  { sura: 5, aya: 42 },
  { sura: 5, aya: 46 },
  { sura: 5, aya: 51 },
  { sura: 5, aya: 58 },
  { sura: 5, aya: 65 },
  { sura: 5, aya: 71 },
  { sura: 5, aya: 77 },
  { sura: 5, aya: 83 },
  { sura: 5, aya: 90 },
  { sura: 5, aya: 96 },
  { sura: 5, aya: 104 },
  { sura: 5, aya: 109 },
  { sura: 5, aya: 114 },
  { sura: 6, aya: 1 },
  { sura: 6, aya: 9 },
  { sura: 6, aya: 19 },
  { sura: 6, aya: 28 },
  { sura: 6, aya: 36 },
  { sura: 6, aya: 45 },
  { sura: 6, aya: 53 },
  { sura: 6, aya: 60 },
  { sura: 6, aya: 69 },
  { sura: 6, aya: 74 },
  { sura: 6, aya: 82 },
  { sura: 6, aya: 91 },
  { sura: 6, aya: 95 },
  { sura: 6, aya: 102 },
  { sura: 6, aya: 111 },
  { sura: 6, aya: 119 },
  { sura: 6, aya: 125 },
  { sura: 6, aya: 132 },
  { sura: 6, aya: 138 },
  { sura: 6, aya: 143 },
  { sura: 6, aya: 147 },
  { sura: 6, aya: 152 },
  { sura: 6, aya: 158 },
  { sura: 7, aya: 1 },
  { sura: 7, aya: 12 },
  { sura: 7, aya: 23 },
  { sura: 7, aya: 31 },
  { sura: 7, aya: 38 },
  { sura: 7, aya: 44 },
  { sura: 7, aya: 52 },
  { sura: 7, aya: 58 },
  { sura: 7, aya: 68 },
  { sura: 7, aya: 74 },
  { sura: 7, aya: 82 },
  { sura: 7, aya: 88 },
  { sura: 7, aya: 96 },
  { sura: 7, aya: 105 },
  { sura: 7, aya: 121 },
  { sura: 7, aya: 131 },
  { sura: 7, aya: 138 },
  { sura: 7, aya: 144 },
  { sura: 7, aya: 150 },
  { sura: 7, aya: 156 },
  { sura: 7, aya: 160 },
  { sura: 7, aya: 164 },
  { sura: 7, aya: 171 },
  { sura: 7, aya: 179 },
  { sura: 7, aya: 188 },
  { sura: 7, aya: 196 },
  { sura: 8, aya: 1 },
  { sura: 8, aya: 9 },
  { sura: 8, aya: 17 },
  { sura: 8, aya: 26 },
  { sura: 8, aya: 34 },
  { sura: 8, aya: 41 },
  { sura: 8, aya: 46 },
  { sura: 8, aya: 53 },
  { sura: 8, aya: 62 },
  { sura: 8, aya: 70 },
  { sura: 9, aya: 1 },
  { sura: 9, aya: 7 },
  { sura: 9, aya: 14 },
  { sura: 9, aya: 21 },
  { sura: 9, aya: 27 },
  { sura: 9, aya: 32 },
  { sura: 9, aya: 37 },
  { sura: 9, aya: 41 },
  { sura: 9, aya: 48 },
  { sura: 9, aya: 55 },
  { sura: 9, aya: 62 },
  { sura: 9, aya: 69 },
  { sura: 9, aya: 73 },
  { sura: 9, aya: 80 },
  { sura: 9, aya: 87 },
  { sura: 9, aya: 94 },
  { sura: 9, aya: 100 },
  { sura: 9, aya: 107 },
  { sura: 9, aya: 112 },
  { sura: 9, aya: 118 },
  { sura: 9, aya: 123 },
  { sura: 10, aya: 1 },
  { sura: 10, aya: 7 },
  { sura: 10, aya: 15 },
  { sura: 10, aya: 21 },
  { sura: 10, aya: 26 },
  { sura: 10, aya: 34 },
  { sura: 10, aya: 43 },
  { sura: 10, aya: 54 },
  { sura: 10, aya: 62 },
  { sura: 10, aya: 71 },
  { sura: 10, aya: 79 },
  { sura: 10, aya: 89 },
  { sura: 10, aya: 98 },
  { sura: 10, aya: 107 },
  { sura: 11, aya: 6 },
  { sura: 11, aya: 13 },
  { sura: 11, aya: 20 },
  { sura: 11, aya: 29 },
  { sura: 11, aya: 38 },
  { sura: 11, aya: 46 },
  { sura: 11, aya: 54 },
  { sura: 11, aya: 63 },
  { sura: 11, aya: 72 },
  { sura: 11, aya: 82 },
  { sura: 11, aya: 89 },
  { sura: 11, aya: 98 },
  { sura: 11, aya: 109 },
  { sura: 11, aya: 118 },
  { sura: 12, aya: 5 },
  { sura: 12, aya: 15 },
  { sura: 12, aya: 23 },
  { sura: 12, aya: 31 },
  { sura: 12, aya: 38 },
  { sura: 12, aya: 44 },
  { sura: 12, aya: 53 },
  { sura: 12, aya: 64 },
  { sura: 12, aya: 70 },
  { sura: 12, aya: 79 },
  { sura: 12, aya: 87 },
  { sura: 12, aya: 96 },
  { sura: 12, aya: 104 },
  { sura: 13, aya: 1 },
  { sura: 13, aya: 6 },
  { sura: 13, aya: 14 },
  { sura: 13, aya: 19 },
  { sura: 13, aya: 29 },
  { sura: 13, aya: 35 },
  { sura: 13, aya: 43 },
  { sura: 14, aya: 6 },
  { sura: 14, aya: 11 },
  { sura: 14, aya: 19 },
  { sura: 14, aya: 25 },
  { sura: 14, aya: 34 },
  { sura: 14, aya: 43 },
  { sura: 15, aya: 1 },
  { sura: 15, aya: 16 },
  { sura: 15, aya: 32 },
  { sura: 15, aya: 52 },
  { sura: 15, aya: 71 },
  { sura: 15, aya: 91 },
  { sura: 16, aya: 7 },
  { sura: 16, aya: 15 },
  { sura: 16, aya: 27 },
  { sura: 16, aya: 35 },
  { sura: 16, aya: 43 },
  { sura: 16, aya: 55 },
  { sura: 16, aya: 65 },
  { sura: 16, aya: 73 },
  { sura: 16, aya: 80 },
  { sura: 16, aya: 88 },
  { sura: 16, aya: 94 },
  { sura: 16, aya: 103 },
  { sura: 16, aya: 111 },
  { sura: 16, aya: 119 },
  { sura: 17, aya: 1 },
  { sura: 17, aya: 8 },
  { sura: 17, aya: 18 },
  { sura: 17, aya: 28 },
  { sura: 17, aya: 39 },
  { sura: 17, aya: 50 },
  { sura: 17, aya: 59 },
  { sura: 17, aya: 67 },
  { sura: 17, aya: 76 },
  { sura: 17, aya: 87 },
  { sura: 17, aya: 97 },
  { sura: 17, aya: 105 },
  { sura: 18, aya: 5 },
  { sura: 18, aya: 16 },
  { sura: 18, aya: 21 },
  { sura: 18, aya: 28 },
  { sura: 18, aya: 35 },
  { sura: 18, aya: 46 },
  { sura: 18, aya: 54 },
  { sura: 18, aya: 62 },
  { sura: 18, aya: 75 },
  { sura: 18, aya: 84 },
  { sura: 18, aya: 98 },
  { sura: 19, aya: 1 },
  { sura: 19, aya: 12 },
  { sura: 19, aya: 26 },
  { sura: 19, aya: 39 },
  { sura: 19, aya: 52 },
  { sura: 19, aya: 65 },
  { sura: 19, aya: 77 },
  { sura: 19, aya: 96 },
  { sura: 20, aya: 13 },
  { sura: 20, aya: 38 },
  { sura: 20, aya: 52 },
  { sura: 20, aya: 65 },
  { sura: 20, aya: 77 },
  { sura: 20, aya: 88 },
  { sura: 20, aya: 99 },
  { sura: 20, aya: 114 },
  { sura: 20, aya: 126 },
  { sura: 21, aya: 1 },
  { sura: 21, aya: 11 },
  { sura: 21, aya: 25 },
  { sura: 21, aya: 36 },
  { sura: 21, aya: 45 },
  { sura: 21, aya: 58 },
  { sura: 21, aya: 73 },
  { sura: 21, aya: 82 },
  { sura: 21, aya: 91 },
  { sura: 21, aya: 102 },
  { sura: 22, aya: 1 },
  { sura: 22, aya: 6 },
  { sura: 22, aya: 16 },
  { sura: 22, aya: 24 },
  { sura: 22, aya: 31 },
  { sura: 22, aya: 39 },
  { sura: 22, aya: 47 },
  { sura: 22, aya: 56 },
  { sura: 22, aya: 65 },
  { sura: 22, aya: 73 },
  { sura: 23, aya: 1 },
  { sura: 23, aya: 18 },
  { sura: 23, aya: 28 },
  { sura: 23, aya: 43 },
  { sura: 23, aya: 60 },
  { sura: 23, aya: 75 },
  { sura: 23, aya: 90 },
  { sura: 23, aya: 105 },
  { sura: 24, aya: 1 },
  { sura: 24, aya: 11 },
  { sura: 24, aya: 21 },
  { sura: 24, aya: 28 },
  { sura: 24, aya: 32 },
  { sura: 24, aya: 37 },
  { sura: 24, aya: 44 },
  { sura: 24, aya: 54 },
  { sura: 24, aya: 59 },
  { sura: 24, aya: 62 },
  { sura: 25, aya: 3 },
  { sura: 25, aya: 12 },
  { sura: 25, aya: 21 },
  { sura: 25, aya: 33 },
  { sura: 25, aya: 44 },
  { sura: 25, aya: 56 },
  { sura: 25, aya: 68 },
  { sura: 26, aya: 1 },
  { sura: 26, aya: 20 },
  { sura: 26, aya: 40 },
  { sura: 26, aya: 61 },
  { sura: 26, aya: 84 },
  { sura: 26, aya: 112 },
  { sura: 26, aya: 137 },
  { sura: 26, aya: 160 },
  { sura: 26, aya: 184 },
  { sura: 26, aya: 207 },
  { sura: 27, aya: 1 },
  { sura: 27, aya: 14 },
  { sura: 27, aya: 23 },
  { sura: 27, aya: 36 },
  { sura: 27, aya: 45 },
  { sura: 27, aya: 56 },
  { sura: 27, aya: 64 },
  { sura: 27, aya: 77 },
  { sura: 27, aya: 89 },
  { sura: 28, aya: 6 },
  { sura: 28, aya: 14 },
  { sura: 28, aya: 22 },
  { sura: 28, aya: 29 },
  { sura: 28, aya: 36 },
  { sura: 28, aya: 44 },
  { sura: 28, aya: 51 },
  { sura: 28, aya: 60 },
  { sura: 28, aya: 71 },
  { sura: 28, aya: 78 },
  { sura: 28, aya: 85 },
  { sura: 29, aya: 7 },
  { sura: 29, aya: 15 },
  { sura: 29, aya: 24 },
  { sura: 29, aya: 31 },
  { sura: 29, aya: 39 },
  { sura: 29, aya: 46 },
  { sura: 29, aya: 53 },
  { sura: 29, aya: 64 },
  { sura: 30, aya: 6 },
  { sura: 30, aya: 16 },
  { sura: 30, aya: 25 },
  { sura: 30, aya: 33 },
  { sura: 30, aya: 42 },
  { sura: 30, aya: 51 },
  { sura: 31, aya: 1 },
  { sura: 31, aya: 12 },
  { sura: 31, aya: 20 },
  { sura: 31, aya: 29 },
  { sura: 32, aya: 1 },
  { sura: 32, aya: 12 },
  { sura: 32, aya: 21 },
  { sura: 33, aya: 1 },
  { sura: 33, aya: 7 },
  { sura: 33, aya: 16 },
  { sura: 33, aya: 23 },
  { sura: 33, aya: 31 },
  { sura: 33, aya: 36 },
  { sura: 33, aya: 44 },
  { sura: 33, aya: 51 },
  { sura: 33, aya: 55 },
  { sura: 33, aya: 63 },
  { sura: 34, aya: 1 },
  { sura: 34, aya: 8 },
  { sura: 34, aya: 15 },
  { sura: 34, aya: 23 },
  { sura: 34, aya: 32 },
  { sura: 34, aya: 40 },
  { sura: 34, aya: 49 },
  { sura: 35, aya: 4 },
  { sura: 35, aya: 12 },
  { sura: 35, aya: 19 },
  { sura: 35, aya: 31 },
  { sura: 35, aya: 39 },
  { sura: 35, aya: 45 },
  { sura: 36, aya: 13 },
  { sura: 36, aya: 28 },
  { sura: 36, aya: 41 },
  { sura: 36, aya: 55 },
  { sura: 36, aya: 71 },
  { sura: 37, aya: 1 },
  { sura: 37, aya: 25 },
  { sura: 37, aya: 52 },
  { sura: 37, aya: 77 },
  { sura: 37, aya: 103 },
  { sura: 37, aya: 127 },
  { sura: 37, aya: 154 },
  { sura: 38, aya: 1 },
  { sura: 38, aya: 17 },
  { sura: 38, aya: 27 },
  { sura: 38, aya: 43 },
  { sura: 38, aya: 62 },
  { sura: 38, aya: 84 },
  { sura: 39, aya: 6 },
  { sura: 39, aya: 11 },
  { sura: 39, aya: 22 },
  { sura: 39, aya: 32 },
  { sura: 39, aya: 41 },
  { sura: 39, aya: 48 },
  { sura: 39, aya: 57 },
  { sura: 39, aya: 68 },
  { sura: 39, aya: 75 },
  { sura: 40, aya: 8 },
  { sura: 40, aya: 17 },
  { sura: 40, aya: 26 },
  { sura: 40, aya: 34 },
  { sura: 40, aya: 41 },
  { sura: 40, aya: 50 },
  { sura: 40, aya: 59 },
  { sura: 40, aya: 67 },
  { sura: 40, aya: 78 },
  { sura: 41, aya: 1 },
  { sura: 41, aya: 12 },
  { sura: 41, aya: 21 },
  { sura: 41, aya: 30 },
  { sura: 41, aya: 39 },
  { sura: 41, aya: 47 },
  { sura: 42, aya: 1 },
  { sura: 42, aya: 11 },
  { sura: 42, aya: 16 },
  { sura: 42, aya: 23 },
  { sura: 42, aya: 32 },
  { sura: 42, aya: 45 },
  { sura: 42, aya: 52 },
  { sura: 43, aya: 11 },
  { sura: 43, aya: 23 },
  { sura: 43, aya: 34 },
  { sura: 43, aya: 48 },
  { sura: 43, aya: 61 },
  { sura: 43, aya: 74 },
  { sura: 44, aya: 1 },
  { sura: 44, aya: 19 },
  { sura: 44, aya: 40 },
  { sura: 45, aya: 1 },
  { sura: 45, aya: 14 },
  { sura: 45, aya: 23 },
  { sura: 45, aya: 33 },
  { sura: 46, aya: 6 },
  { sura: 46, aya: 15 },
  { sura: 46, aya: 21 },
  { sura: 46, aya: 29 },
  { sura: 47, aya: 1 },
  { sura: 47, aya: 12 },
  { sura: 47, aya: 20 },
  { sura: 47, aya: 30 },
  { sura: 48, aya: 1 },
  { sura: 48, aya: 10 },
  { sura: 48, aya: 16 },
  { sura: 48, aya: 24 },
  { sura: 48, aya: 29 },
  { sura: 49, aya: 5 },
  { sura: 49, aya: 12 },
  { sura: 50, aya: 1 },
  { sura: 50, aya: 16 },
  { sura: 50, aya: 36 },
  { sura: 51, aya: 7 },
  { sura: 51, aya: 31 },
  { sura: 51, aya: 52 },
  { sura: 52, aya: 15 },
  { sura: 52, aya: 32 },
  { sura: 53, aya: 1 },
  { sura: 53, aya: 27 },
  { sura: 53, aya: 45 },
  { sura: 54, aya: 7 },
  { sura: 54, aya: 28 },
  { sura: 54, aya: 50 },
  { sura: 55, aya: 17 },
  { sura: 55, aya: 41 },
  { sura: 55, aya: 68 },
  { sura: 56, aya: 17 },
  { sura: 56, aya: 51 },
  { sura: 56, aya: 77 },
  { sura: 57, aya: 4 },
  { sura: 57, aya: 12 },
  { sura: 57, aya: 19 },
  { sura: 57, aya: 25 },
  { sura: 58, aya: 1 },
  { sura: 58, aya: 7 },
  { sura: 58, aya: 12 },
  { sura: 58, aya: 22 },
  { sura: 59, aya: 4 },
  { sura: 59, aya: 10 },
  { sura: 59, aya: 17 },
  { sura: 60, aya: 1 },
  { sura: 60, aya: 6 },
  { sura: 60, aya: 12 },
  { sura: 61, aya: 6 },
  { sura: 62, aya: 1 },
  { sura: 62, aya: 9 },
  { sura: 63, aya: 5 },
  { sura: 64, aya: 1 },
  { sura: 64, aya: 10 },
  { sura: 65, aya: 1 },
  { sura: 65, aya: 6 },
  { sura: 66, aya: 1 },
  { sura: 66, aya: 8 },
  { sura: 67, aya: 1 },
  { sura: 67, aya: 13 },
  { sura: 67, aya: 27 },
  { sura: 68, aya: 16 },
  { sura: 68, aya: 43 },
  { sura: 69, aya: 9 },
  { sura: 69, aya: 35 },
  { sura: 70, aya: 11 },
  { sura: 70, aya: 40 },
  { sura: 71, aya: 11 },
  { sura: 72, aya: 1 },
  { sura: 72, aya: 14 },
  { sura: 73, aya: 1 },
  { sura: 73, aya: 20 },
  { sura: 74, aya: 18 },
  { sura: 74, aya: 48 },
  { sura: 75, aya: 20 },
  { sura: 76, aya: 6 },
  { sura: 76, aya: 26 },
  { sura: 77, aya: 20 },
  { sura: 78, aya: 1 },
  { sura: 78, aya: 31 },
  { sura: 79, aya: 16 },
  { sura: 80, aya: 1 },
  { sura: 81, aya: 1 },
  { sura: 82, aya: 1 },
  { sura: 83, aya: 7 },
  { sura: 83, aya: 35 },
  { sura: 85, aya: 1 },
  { sura: 86, aya: 1 },
  { sura: 87, aya: 16 },
  { sura: 89, aya: 1 },
  { sura: 89, aya: 24 },
  { sura: 91, aya: 1 },
  { sura: 92, aya: 15 },
  { sura: 95, aya: 1 },
  { sura: 97, aya: 1 },
  { sura: 98, aya: 8 },
  { sura: 100, aya: 10 },
  { sura: 103, aya: 1 },
  { sura: 106, aya: 1 },
  { sura: 109, aya: 1 },
  { sura: 112, aya: 1 },
  { sura: 115, aya: 1 },
];

export const JUZ_START_PAGES: readonly number[] = [
  1, 22, 42, 62, 82, 102, 122, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322,
  342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

// Start verse [sura, aya] of every rub' el-hizb 1–240 in the Madani (Hafs)
// mushaf — one hizb (four rubs) per line. Taken from Quran.com /rub_el_hizbs
// and cross-checked against Tanzil (the only difference, rub 106, is the
// Madani mark at 15:49). These marks are fixed, so they are bundled rather
// than fetched: the API list is keyed by `rub_el_hizb_number`, and reading it
// by any other name silently collapsed every rub to its whole hizb.
const RUB_STARTS: readonly (readonly [number, number])[] = [
  [1, 1], [2, 26], [2, 44], [2, 60], // 1
  [2, 75], [2, 92], [2, 106], [2, 124], // 2
  [2, 142], [2, 158], [2, 177], [2, 189], // 3
  [2, 203], [2, 219], [2, 233], [2, 243], // 4
  [2, 253], [2, 263], [2, 272], [2, 283], // 5
  [3, 15], [3, 33], [3, 52], [3, 75], // 6
  [3, 93], [3, 113], [3, 133], [3, 153], // 7
  [3, 171], [3, 186], [4, 1], [4, 12], // 8
  [4, 24], [4, 36], [4, 58], [4, 74], // 9
  [4, 88], [4, 100], [4, 114], [4, 135], // 10
  [4, 148], [4, 163], [5, 1], [5, 12], // 11
  [5, 27], [5, 41], [5, 51], [5, 67], // 12
  [5, 82], [5, 97], [5, 109], [6, 13], // 13
  [6, 36], [6, 59], [6, 74], [6, 95], // 14
  [6, 111], [6, 127], [6, 141], [6, 151], // 15
  [7, 1], [7, 31], [7, 47], [7, 65], // 16
  [7, 88], [7, 117], [7, 142], [7, 156], // 17
  [7, 171], [7, 189], [8, 1], [8, 22], // 18
  [8, 41], [8, 61], [9, 1], [9, 19], // 19
  [9, 34], [9, 46], [9, 60], [9, 75], // 20
  [9, 93], [9, 111], [9, 122], [10, 11], // 21
  [10, 26], [10, 53], [10, 71], [10, 90], // 22
  [11, 6], [11, 24], [11, 41], [11, 61], // 23
  [11, 84], [11, 108], [12, 7], [12, 30], // 24
  [12, 53], [12, 77], [12, 101], [13, 5], // 25
  [13, 19], [13, 35], [14, 10], [14, 28], // 26
  [15, 1], [15, 49], [16, 1], [16, 30], // 27
  [16, 51], [16, 75], [16, 90], [16, 111], // 28
  [17, 1], [17, 23], [17, 50], [17, 70], // 29
  [17, 99], [18, 17], [18, 32], [18, 51], // 30
  [18, 75], [18, 99], [19, 22], [19, 59], // 31
  [20, 1], [20, 55], [20, 83], [20, 111], // 32
  [21, 1], [21, 29], [21, 51], [21, 83], // 33
  [22, 1], [22, 19], [22, 38], [22, 60], // 34
  [23, 1], [23, 36], [23, 75], [24, 1], // 35
  [24, 21], [24, 35], [24, 53], [25, 1], // 36
  [25, 21], [25, 53], [26, 1], [26, 52], // 37
  [26, 111], [26, 181], [27, 1], [27, 27], // 38
  [27, 56], [27, 82], [28, 12], [28, 29], // 39
  [28, 51], [28, 76], [29, 1], [29, 26], // 40
  [29, 46], [30, 1], [30, 31], [30, 54], // 41
  [31, 22], [32, 11], [33, 1], [33, 18], // 42
  [33, 31], [33, 51], [33, 60], [34, 10], // 43
  [34, 24], [34, 46], [35, 15], [35, 41], // 44
  [36, 28], [36, 60], [37, 22], [37, 83], // 45
  [37, 145], [38, 21], [38, 52], [39, 8], // 46
  [39, 32], [39, 53], [40, 1], [40, 21], // 47
  [40, 41], [40, 66], [41, 9], [41, 25], // 48
  [41, 47], [42, 13], [42, 27], [42, 51], // 49
  [43, 24], [43, 57], [44, 17], [45, 12], // 50
  [46, 1], [46, 21], [47, 10], [47, 33], // 51
  [48, 18], [49, 1], [49, 14], [50, 27], // 52
  [51, 31], [52, 24], [53, 26], [54, 9], // 53
  [55, 1], [56, 1], [56, 75], [57, 16], // 54
  [58, 1], [58, 14], [59, 11], [60, 7], // 55
  [62, 1], [63, 4], [65, 1], [66, 1], // 56
  [67, 1], [68, 1], [69, 1], [70, 19], // 57
  [72, 1], [73, 20], [75, 1], [76, 19], // 58
  [78, 1], [80, 1], [82, 1], [84, 1], // 59
  [87, 1], [90, 1], [94, 1], [100, 9], // 60
];

// Verse count per surah — used to step back across a surah boundary when
// deriving a rub's last verse. Index 0 unused.
const SURAH_VERSE_COUNTS: readonly number[] = [
  0,
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

// Static surah names — used offline when chaptersCache is empty (API/IDB unavailable).
// Index 0 unused; index 1–114 maps sura ID → names.
const SURAH_NAMES_AR: readonly string[] = [
  "",
  "الفاتحة","البقرة","آل عمران","النساء","المائدة","الأنعام","الأعراف","الأنفال","التوبة","يونس",
  "هود","يوسف","الرعد","إبراهيم","الحجر","النحل","الإسراء","الكهف","مريم","طه",
  "الأنبياء","الحج","المؤمنون","النور","الفرقان","الشعراء","النمل","القصص","العنكبوت","الروم",
  "لقمان","السجدة","الأحزاب","سبأ","فاطر","يس","الصافات","ص","الزمر","غافر",
  "فصلت","الشورى","الزخرف","الدخان","الجاثية","الأحقاف","محمد","الفتح","الحجرات","ق",
  "الذاريات","الطور","النجم","القمر","الرحمن","الواقعة","الحديد","المجادلة","الحشر","الممتحنة",
  "الصف","الجمعة","المنافقون","التغابن","الطلاق","التحريم","الملك","القلم","الحاقة","المعارج",
  "نوح","الجن","المزمل","المدثر","القيامة","الإنسان","المرسلات","النبأ","النازعات","عبس",
  "التكوير","الانفطار","المطففين","الانشقاق","البروج","الطارق","الأعلى","الغاشية","الفجر","البلد",
  "الشمس","الليل","الضحى","الشرح","التين","العلق","القدر","البينة","الزلزلة","العاديات",
  "القارعة","التكاثر","العصر","الهمزة","الفيل","قريش","الماعون","الكوثر","الكافرون","النصر",
  "المسد","الإخلاص","الفلق","الناس",
];

const SURAH_NAMES_EN: readonly string[] = [
  "",
  "Al-Fatihah","Al-Baqarah","Ali 'Imran","An-Nisa","Al-Ma'idah","Al-An'am","Al-A'raf","Al-Anfal","At-Tawbah","Yunus",
  "Hud","Yusuf","Ar-Ra'd","Ibrahim","Al-Hijr","An-Nahl","Al-Isra","Al-Kahf","Maryam","Ta-Ha",
  "Al-Anbya","Al-Hajj","Al-Mu'minun","An-Nur","Al-Furqan","Ash-Shu'ara","An-Naml","Al-Qasas","Al-'Ankabut","Ar-Rum",
  "Luqman","As-Sajdah","Al-Ahzab","Saba","Fatir","Ya-Sin","As-Saffat","Sad","Az-Zumar","Ghafir",
  "Fussilat","Ash-Shuraa","Az-Zukhruf","Ad-Dukhan","Al-Jathiyah","Al-Ahqaf","Muhammad","Al-Fath","Al-Hujurat","Qaf",
  "Adh-Dhariyat","At-Tur","An-Najm","Al-Qamar","Ar-Rahman","Al-Waqi'ah","Al-Hadid","Al-Mujadila","Al-Hashr","Al-Mumtahanah",
  "As-Saf","Al-Jumu'ah","Al-Munafiqun","At-Taghabun","At-Talaq","At-Tahrim","Al-Mulk","Al-Qalam","Al-Haqqah","Al-Ma'arij",
  "Nuh","Al-Jinn","Al-Muzzammil","Al-Muddaththir","Al-Qiyamah","Al-Insan","Al-Mursalat","An-Naba","An-Nazi'at","'Abasa",
  "At-Takwir","Al-Infitar","Al-Mutaffifin","Al-Inshiqaq","Al-Buruj","At-Tariq","Al-A'la","Al-Ghashiyah","Al-Fajr","Al-Balad",
  "Ash-Shams","Al-Layl","Ad-Duha","Ash-Sharh","At-Tin","Al-'Alaq","Al-Qadr","Al-Bayyinah","Az-Zalzalah","Al-'Adiyat",
  "Al-Qari'ah","At-Takathur","Al-'Asr","Al-Humazah","Al-Fil","Quraysh","Al-Ma'un","Al-Kawthar","Al-Kafirun","An-Nasr",
  "Al-Masad","Al-Ikhlas","Al-Falaq","An-Nas",
];

// ─── In‑memory caches ────────────────────────────────────────────────────────
let chaptersCache: any[] = [];
let juzsCache: any[] = [];
let pageToSuraMap: Map<number, number> | null = null;
let initPromise: Promise<void> | null = null;

export async function initMetadata(): Promise<void> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    // 1. Chapters
    const chaptersRecord = await idb.get<{ key: string; value: any[] }>(
      "meta",
      "chapters",
    );
    let chapters = Array.isArray(chaptersRecord?.value)
      ? chaptersRecord.value
      : [];
    if (chapters.length === 0) {
      const raw = await fetchChapters();
      chapters = Array.isArray(raw) ? raw : [];
      if (chapters.length > 0)
        await idb.put("meta", { key: "chapters", value: chapters });
    }
    chaptersCache = chapters;

    // 2. Juzs
    const juzsRecord = await idb.get<{ key: string; value: any[] }>(
      "meta",
      "juzs",
    );
    let juzs = Array.isArray(juzsRecord?.value) ? juzsRecord.value : [];
    if (juzs.length === 0) {
      const raw = await fetchJuzs();
      juzs = Array.isArray(raw) ? raw : [];
      if (juzs.length > 0) await idb.put("meta", { key: "juzs", value: juzs });
    }
    juzsCache = juzs;

    // 3. Page → surah mapping
    const suraMap = new Map<number, number>();
    for (const ch of chaptersCache) {
      const start = ch.pages?.[0] ?? 1;
      const end = ch.pages?.[1] ?? start;
      for (let p = start; p <= end; p++) suraMap.set(p, ch.id);
    }
    pageToSuraMap = suraMap;
  })();
  return initPromise;
}

// ─── Public accessors ────────────────────────────────────────────────────────
export function getChapters(): any[] {
  return chaptersCache;
}
export function getSuraForPage(page: number): number | undefined {
  if (pageToSuraMap?.size) return pageToSuraMap.get(page);
  // Offline fallback: PAGE_STARTS is indexed by page number (0-based entry 0 is unused).
  const entry = PAGE_STARTS[page];
  return entry?.sura || undefined;
}
export function getSurahNameArabic(suraId: number): string {
  const ch = chaptersCache.find((c: any) => c.id === suraId);
  return ch?.name_arabic ?? SURAH_NAMES_AR[suraId] ?? `سورة ${suraId}`;
}
export function getSurahNameEnglish(suraId: number): string {
  const ch = chaptersCache.find((c: any) => c.id === suraId);
  return ch?.name_simple ?? ch?.translated_name?.name ?? SURAH_NAMES_EN[suraId] ?? `Surah ${suraId}`;
}
export function getSurahStartPage(suraId: number): number {
  const ch = chaptersCache.find((c: any) => c.id === suraId);
  return ch ? ch.pages?.[0] ?? 1 : 1;
}

export function getSurahEndPage(suraId: number): number {
  const ch = chaptersCache.find((c: any) => c.id === suraId);
  return ch ? ch.pages?.[1] ?? ch.pages?.[0] ?? 604 : 604;
}

export function getPageStart(page: number): PageStart | null {
  if (page < 1 || page > 604) return null;
  return PAGE_STARTS[page];
}

export function estimatePageForVerse(sura: number, aya: number): number {
  let lo = 1,
    hi = 604,
    answer = 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const start = PAGE_STARTS[mid];
    if (verseLessThanOrEqual(start, { sura, aya })) {
      answer = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return answer;
}
function verseLessThanOrEqual(
  v1: { sura: number; aya: number },
  v2: { sura: number; aya: number },
): boolean {
  return v1.sura < v2.sura || (v1.sura === v2.sura && v1.aya <= v2.aya);
}

// ─── Juz ─────────────────────────────────────────────────────────────────────
export function getJuzStart(juzNumber: number): { sura: number; aya: number } {
  const juz = juzsCache?.find((j: any) => j.juz_number === juzNumber);
  if (!juz?.verse_mapping) return { sura: 1, aya: 1 };
  const mapping = juz.verse_mapping as Record<string, string>;
  const firstSuraId = Object.keys(mapping).sort(
    (a, b) => Number(a) - Number(b),
  )[0];
  const raw = mapping[firstSuraId];
  const dashIdx = raw?.indexOf("-");
  const startAya = dashIdx >= 0 ? raw.substring(0, dashIdx) : raw;
  return { sura: Number(firstSuraId), aya: Number(startAya) || 1 };
}

export function getJuzEnd(juzNumber: number): { sura: number; aya: number } {
  const juz = juzsCache?.find((j: any) => j.juz_number === juzNumber);
  if (!juz?.verse_mapping) return { sura: 114, aya: 6 };
  const mapping = juz.verse_mapping as Record<string, string>;
  const lastSuraId = Object.keys(mapping)
    .sort((a, b) => Number(a) - Number(b))
    .at(-1)!;
  const raw = mapping[lastSuraId];
  const dashIdx = raw?.indexOf("-");
  const endAya = dashIdx >= 0 ? raw.substring(dashIdx + 1) : raw;
  return { sura: Number(lastSuraId), aya: Number(endAya) || 6 };
}

// ─── Hizb / Rub el‑Hizb ──────────────────────────────────────────────────────
// All derived from the bundled RUB_STARTS table: hizb n = rubs 4n-3 … 4n, and a
// unit ends on the verse just before the next unit starts.

/** The verse immediately before `v` (stepping back into the previous surah). */
function verseBefore(v: { sura: number; aya: number }): {
  sura: number;
  aya: number;
} {
  if (v.aya > 1) return { sura: v.sura, aya: v.aya - 1 };
  return { sura: v.sura - 1, aya: SURAH_VERSE_COUNTS[v.sura - 1] };
}

export function getRubStart(rubNumber: number): { sura: number; aya: number } {
  const [sura, aya] = RUB_STARTS[Math.min(240, Math.max(1, rubNumber)) - 1];
  return { sura, aya };
}

export function getRubEnd(rubNumber: number): { sura: number; aya: number } {
  if (rubNumber >= 240) return { sura: 114, aya: 6 };
  return verseBefore(getRubStart(rubNumber + 1));
}

export function getHizbStart(hizbNumber: number): {
  sura: number;
  aya: number;
} {
  return getRubStart((hizbNumber - 1) * 4 + 1);
}

export function getHizbEnd(hizbNumber: number): { sura: number; aya: number } {
  return getRubEnd(hizbNumber * 4);
}

/** A rub'/hizb boundary: the page it starts on and the exact start verse. */
export interface UnitBoundary {
  page: number;
  sura: number;
  aya: number;
}

/** Start verse + page of every `rubsPerUnit`-th rub (1 = rubs, 4 = hizbs). */
function unitBoundaries(rubsPerUnit: number): UnitBoundary[] {
  const out: UnitBoundary[] = [];
  for (let i = 0; i < RUB_STARTS.length; i += rubsPerUnit) {
    const [sura, aya] = RUB_STARTS[i];
    out.push({ page: estimatePageForVerse(sura, aya), sura, aya });
  }
  return out;
}

/** Rub' boundaries (verse + page), 1..240. */
export function getRubBoundaries(): UnitBoundary[] {
  return unitBoundaries(1);
}

/** Hizb boundaries (verse + page), 1..60. */
export function getHizbBoundaries(): UnitBoundary[] {
  return unitBoundaries(4);
}

/** Start page of every rub' el-hizb (1..240). */
export function getRubStartPages(): number[] {
  return getRubBoundaries().map((b) => b.page);
}

/** Start page of every hizb (1..60). */
export function getHizbStartPages(): number[] {
  return getHizbBoundaries().map((b) => b.page);
}

export function getRubNumberForPage(page: number): number {
  const pageStarts = getRubStartPages();
  for (let i = 0; i < pageStarts.length; i++) {
    const nextStartPage = i < pageStarts.length - 1 ? pageStarts[i + 1] : 605;
    if (page >= pageStarts[i] && page < nextStartPage) return i + 1;
  }
  return 1;
}
