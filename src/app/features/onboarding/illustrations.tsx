/**
 * Gold line-art for the welcome and "What's new" slides. Strokes use
 * currentColor so the deck's --color-gold drives them in day and night.
 */
import React from "react";
import type { IllustrationId } from "./tourCatalog";

const ART: Record<IllustrationId, React.ReactNode> = {
  brand: (
    <>
      <rect x="45" y="45" width="70" height="70" rx="4" />
      <rect x="45" y="45" width="70" height="70" rx="4" transform="rotate(45 80 80)" />
      <circle cx="80" cy="80" r="20" />
      <path d="M86 70a11 11 0 1 0 0 20a8.5 8.5 0 1 1 0-20z" />
    </>
  ),
  mushaf: (
    <>
      <path d="M80 52C64 42 40 42 28 48v64c12-6 36-6 52 4c16-10 40-10 52-4V48c-12-6-36-6-52 4z" />
      <path d="M80 52v64" />
      <path d="M40 64c10-3 22-3 32 0M40 78c10-3 22-3 32 0M40 92c10-3 22-3 32 0M88 64c10-3 22-3 32 0M88 78c10-3 22-3 32 0M88 92c10-3 22-3 32 0" opacity=".55" />
      <path d="M48 130l32-14 32 14M60 138l20-10 20 10" />
    </>
  ),
  recite: (
    <>
      <path d="M28 128q52-20 104 0V82q-52-20-104 0z" />
      <path d="M80 72v46" />
      <path d="M40 92q14-5 28-2M40 106q14-5 28-2M92 90q14-3 28 2M92 104q14-3 28 2" opacity=".55" />
      <rect x="68" y="12" width="24" height="38" rx="12" />
      <path d="M58 36q0 24 22 24t22-24" opacity=".75" />
      <path d="M42 28q-8 10 0 20M118 28q8 10 0 20" opacity=".5" />
    </>
  ),
  quiz: (
    <>
      <rect x="36" y="26" width="88" height="112" rx="10" />
      <path d="M52 56l8 8 14-16" />
      <path d="M84 58h26" opacity=".7" />
      <path d="M52 88l8 8 14-16" />
      <path d="M84 90h26" opacity=".7" />
      <path d="M54 118h52" opacity=".45" />
    </>
  ),
  worship: (
    <>
      <circle cx="62" cy="70" r="34" strokeDasharray="0.5 10" strokeWidth="7" />
      <path d="M62 104v14" />
      <circle cx="62" cy="124" r="5" />
      <rect x="100" y="66" width="40" height="58" rx="6" />
      <path d="M108 84l5 5 9-10M108 106l5 5 9-10" />
    </>
  ),
  qibla: (
    <>
      <circle cx="80" cy="88" r="48" />
      <path d="M80 40v8M80 128v8M32 88h8M120 88h8" />
      <path d="M80 60l10 28-10 28-10-28z" />
      <path d="M66 32V22q14-16 28 0v10" opacity=".7" />
    </>
  ),
};

export const Illustration: React.FC<{ id: IllustrationId }> = ({ id }) => (
  <svg
    viewBox="0 0 160 160"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {ART[id]}
  </svg>
);
