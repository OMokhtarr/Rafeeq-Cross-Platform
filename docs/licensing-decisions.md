# Licensing decisions

Durable record of third-party content permissions and decisions affecting
Rafeeq. Kept in-repo because email is a weak place to store a licensing grant —
it must survive a laptop change and be findable at audit time.

---

## 1. QF Quran script — express permission granted

**Status:** Granted. Conditional on a migration obligation.
**Date:** 2026-08-21
**Granted by:** Basit Minhas, Quran Foundation, by email to
`or.mokhtar@gmail.com` (thread: "Content Sync scope").

Quran Foundation expressly permits Rafeeq, under **Section 3.1(3)(a) of the QF
Developer Terms**, to store the Quran script and associated page-layout/glyph
data returned by `/verses/by_page/` locally **beyond one week**, for its
offline-reading experience, until that content becomes available through
Content Sync.

Cached script **may remain readable when the user has no connectivity** — it
does not need to be withheld after seven days.

**Scope limits, quoted from the grant:** limited to the QF-provided Quran script
and associated page-layout/glyph data used inside Rafeeq. It does **not** permit
modification, sale, sublicensing, export, or redistribution of the content. All
other Developer Terms continue to apply.

**Ongoing obligation:** QF asked that the Content Sync documentation be checked
roughly weekly. Once Quran script support is added there, Rafeeq must migrate
this data onto Content Sync and follow the documented sync requirements. The
permission is explicitly framed as lasting *until* that support exists.

Docs: https://api-docs.quran.foundation/docs/tutorials/content-sync/getting-started/

**Superseded in part — see §1a.** Mushaf support reached Content Sync on
2026-09, triggering the migration obligation above for page-layout data only.
The rest of §1 remains in force.

---

## 1a. QF clarification — what migrates, what stays cached

**Status:** Confirmed by QF. §1 permission continues for the data that Content
Sync does not carry.
**Date:** 2026-09-14
**Confirmed by:** Basit Minhas, Quran Foundation, by email (thread: "Content
Sync scope"), replying to a test report from Rafeeq. Also addressed to QF
`developers`.

### Background

QF sent three notices in quick succession: migrate to `mushafs:1`; disregard
that; rollout live and `mushafs:19` applies to Rafeeq. **QF has confirmed all
three came from them**, that the rollback notice is superseded, and that the
third stands. Rafeeq took no action on any of them before this confirmation.

Rafeeq tested `mushafs:19` against the live API and reported two gaps. This
entry records QF's answers.

### What Content Sync now carries

**Page layout only.** `mushafs:19` ("QCF V4 Tajweed") serves `mushaf`,
`mushaf_page` and `mushaf_word` records — 604 pages, positioned glyphs. Rafeeq
must migrate this data onto Content Sync and sync at least every 7 days
(Developer Terms §3.1(3)(b)). The app's existing 24 h cadence satisfies this.

### What stays cached under the §1 permission

QF confirmed **all three** of the following remain covered by the 2026-08-21
permission, with no need to delay the migration on their account:

1. **Per-page COLRv1 V4 font files** from
   `verses.quran.foundation/fonts/quran/hafs/v4/colrv1/woff2/`.
   `font_asset` records are **not populated** on `mushafs:19` or `mushafs:1` —
   QF describes this as a gap on their side. Keep caching locally. QF will
   notify Rafeeq if `font_asset` records land.
2. **Word-level `text_uthmani`** from `/verses/by_page/`. There is **no Content
   Sync resource carrying per-word Uthmani text today**. QF explicitly endorsed
   continuing to source and cache it as now, noting that word-boundary
   alignment is load-bearing for Rafeeq's recitation matching and quizzes.
3. **Legacy V1 `QCF_BSML.TTF`** (bismillah strip, via jsDelivr). Not a Content
   Sync resource; V4 ships no equivalent. Keep loading and caching it.

**Condition, quoted in substance:** coverage holds "for as long as they're used
inside Rafeeq's own offline reading experience rather than exposed or
redistributed separately." The §1 scope limits (no modification, sale,
sublicensing, export, redistribution) continue to apply.

**Refresh cadence for the non-synced data:** QF asked that the font files and
the `/verses/by_page/` word text be periodically re-fetched — at least every 7
days, ideally on Rafeeq's existing 24 h schedule. This is a **new obligation
attaching to data that is not part of Content Sync**, and it is easy to miss:
the sync engine will not cover it automatically. See
`docs/superpowers/specs/2026-08-25-mushafs-sync-scope.md`.

### Net effect

The migration is **partial by design, not by omission**. After it lands, Rafeeq
still relies on the §1 permission for the fonts and the word-level Uthmani text.
§1 is therefore **not discharged** and must not be treated as historical.

---

## 2. KFGQPC illuminated surah-header ornament — proceeding without a reply

**Status:** Decision taken to publish. **No permission was obtained.**
**Date of decision:** 2026-08-22
**Decided by:** Omar Mokhtar (developer).

### What the asset is

Rafeeq renders each surah title inside the illuminated band used by the printed
Madani Mushaf — the arabesque scrollwork, two medallions, and lobed cartouche.
It was produced by **tracing the ornament from an official KFGQPC Madani page
render into a single vector outline, then simplifying it**. The surah name
itself is not part of the asset: that comes from the `sura_names` font
distributed with the Quran.com assets. The traced band is the surrounding frame
only, drawn in a single colour with no background.

### Where the question stood

Quran Foundation was asked whether the trace was acceptable. Basit Minhas
replied on 2026-08-17 that **QF cannot grant permission on KFGQPC's behalf**,
that KFGQPC's own terms control the rights to the source artwork, and that if
those terms are unclear about this kind of use, KFGQPC should be contacted
directly before publishing.

KFGQPC was **not** contacted, and no permission was sought or received. The
open question — whether a traced-and-simplified reproduction counts as a
derivative work, when KFGQPC materials are generally licensed for distribution
unmodified — remains unanswered.

### The decision

Proceed to release without a reply, accepting the risk.

This is recorded as a **decision to publish without an answer**, not as a
resolution of the underlying question. Nothing here should be read as a
determination that the trace is permitted.

### Mitigation if challenged

The ornament is **one self-contained asset**, and replacing it is
straightforward: substitute original artwork that does not derive from the
KFGQPC page render. That fallback remains available and cheap at any point,
including after release. If KFGQPC ever objects, that is the response — no
architectural change is involved.

### If this is revisited

The stronger position, should it ever be wanted, is either an express
permission from KFGQPC or a replacement asset. Either would convert this entry
from a risk acceptance into an actual resolution.
