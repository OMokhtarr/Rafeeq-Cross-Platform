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
