/**
 * Line icons for the tracker's time-anchored acts: the sun's path through
 * the day for the five prayers and the azkar, and an open mushaf for the
 * Quran. Drawn on one 24px grid with the same stroke as the More page icons.
 */
import React from "react";
import type { ItemId } from "./trackerCatalog";

const Svg: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg
    className="wt-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

// Sun on the horizon with an arrow: rising for dawn, setting for sunset.
const horizon = (arrowUp: boolean) => (
  <Svg>
    <path d="M3 18h18" />
    <path d="M7 18a5 5 0 0 1 10 0" />
    <path d={arrowUp ? "M12 3v6M9.5 5.5L12 3l2.5 2.5" : "M12 3v6M9.5 6.5L12 9l2.5-2.5"} />
    <path d="M4.5 13.5l1.4.8M19.5 13.5l-1.4.8" />
  </Svg>
);

const sun = (
  <Svg>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Svg>
);

const sunCloud = (
  <Svg>
    <circle cx="15" cy="8" r="3" />
    <path d="M15 2.5v1M20.5 8h-1M18.9 4.1l-.7.7" />
    <path d="M7 20h9a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 7 20z" />
  </Svg>
);

const crescent = (
  <Svg>
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </Svg>
);

const crescentStars = (
  <Svg>
    <path d="M17 15.5A7 7 0 1 1 8.5 6a5.5 5.5 0 0 0 8.5 9.5z" />
    <path d="M18 3.5v3M16.5 5h3M20.5 9.5v2M19.5 10.5h2" />
  </Svg>
);

const book = (
  <Svg>
    <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z" />
    <path d="M12 6.5v13" />
  </Svg>
);

export const ITEM_ICONS: Partial<Record<ItemId, React.ReactNode>> = {
  fajr: horizon(true),
  dhuhr: sun,
  asr: sunCloud,
  maghrib: horizon(false),
  isha: crescent,
  azkarMorning: horizon(true),
  azkarEvening: sunCloud,
  azkarSleep: crescentStars,
  quranDaily: book,
};
