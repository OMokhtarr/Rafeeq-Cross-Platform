# Rafeeq Cross Platform — Claude Instructions

## Knowledge Graph First

This project has a knowledge graph at `.understand-anything/knowledge-graph.json` (158 files analyzed).

**Before using Glob, Grep, or Read to explore the codebase**, first use the `understand-anything:understand-chat` skill to answer the question from the graph. Only fall back to direct file search/read if the graph doesn't have enough detail or the answer needs live code verification.

Example: instead of grepping for "MediaSession", first ask `/understand-chat where is the Android Auto media session handled?`

## CSS Rules — Always Enforce

### No visible scrollbars
**Never add visible scrollbars anywhere.** The global rule in `src/index.css` already hides them universally (`scrollbar-width: none`, `-ms-overflow-style: none`, `::-webkit-scrollbar { display: none }`). When adding any new scrollable container (overflow: auto/scroll, IonContent, grid/flex with overflow), do NOT add scroll styling that would make scrollbars visible. If a component-level CSS file adds overflow, you do not need to repeat the hide rules — the global rule in `index.css` covers it.

### No ESLint disable comments
Never add `// eslint-disable` comments of any kind, including `react-hooks/exhaustive-deps`. The ESLint plugin is not configured in this project and these comments are noise.

### Page width cap — always use the CSS variable
All page/view containers must cap their width at `var(--max-width-mobile, 600px)` (defined in `src/styles/tokens.css` as `500px`) and center with `margin: 0 auto`. Never hard-code `600px` or any other pixel value for page max-width. Use `var(--max-width-mobile, 600px)` so the single token controls layout across every page.

### Fixed BottomNavBar — always account for its height
`BottomNavBar` with `fixed` prop is `position: absolute; bottom: 0` on `IonPage`, overlaying the bottom of `IonContent` at all times. Every page/view container that scrolls inside `IonContent` **must** have `padding-bottom: calc(var(--bottom-nav-height) + var(--space-6))` (or similar) so content is never hidden under the nav bar. Do NOT rely on a spacer `<div>` after the content container — that only clears space at the very end of the scroll, not while scrolling through the content.
