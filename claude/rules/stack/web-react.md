---
paths:
---

# Web (React + Vite + TypeScript)

Scope: web SPAs in dk-coding repos only. In older repos, their own CLAUDE.md governs.

Layer map (`core/`, `services/`, `hooks/`, `components/`, `pages/`, `design/`, `app/`): see core/architecture-hexagonal.md. Shared-code placement: see core/dry.md. Naming, doc comments, unit size, formatter: see stack/code-style.md. Which units are versioned: see stack/versioning.md.

## Toolchain (gates; never disable a rule to go green)

- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: bundler`.
- ESLint 9 flat config: `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked`, `react`, `react-hooks`, `jsx-a11y` (error), `import-x` (`no-cycle`; `no-default-export` except route-lazy files), `jsdoc`. ESLint enforces `no-explicit-any`, the axios/`fetch`/WebSocket import ban outside `services/`, the `process.env` ban and the direct `v<N>` import ban.
- Stylelint enforces tokens: no hex colours and no raw px for spacing or radius outside `design/tokens.css`, `custom-property-pattern`, BEM-style `selector-class-pattern`, `declaration-no-important`.
- Architecture and budgets: `dependency-cruiser`, `knip`, jscpd (core/dry.md), `check:versions`, `size-limit` on the main chunk.
- Tests: Vitest + Testing Library (jsdom) + axe for hooks and components; Playwright for flows against a mocked API. Strategy lives in stack/testing.md.

## Components and hooks

- Named exports; one component per file; props typed as `interface <Component>Props` with `children` explicit.
- Components are presentational: data in, callbacks out. Do side effects in a hook; the hook calls use cases and services through the composition context. Why: a component that fetches cannot be tested without the network.
- Services are the only callers of axios, `fetch`, WebSocket and `localStorage`; they parse every response with the contract schema and return typed values or typed errors.
- The env schema in `app/env.ts` (core/dry.md) parses `import.meta.env` once and fails fast at boot. `VITE_*` values are public: never a secret (stack/security.md).
- Money, dates, permissions and sort rules live in `core/`, never in JSX (stack/time-money-i18n.md).
- Key lists by stable ids, never by array index.
- Do not use `useEffect` for derived state; derive it in render or with `useMemo`. Use effects only for subscriptions and imperative APIs.
- Every data-bearing component renders loading, empty and error states, each covered by a test.

## CSS

- Vanilla CSS only, no Tailwind, no CSS-in-JS; values come from custom properties in `design/tokens.css`. File, class and custom-property naming: stack/code-style.md.
- No inline `style` except computed geometry; no `!important`; dark mode redefines tokens, never selectors.

## Accessibility (target: WCAG 2.2 AA)

- Every interactive element is keyboard reachable with a visible focus indicator; every input has a label; hit targets are at least 44 px (exceeds 2.5.8).
- 2.4.11 Focus Not Obscured: sticky headers, toasts and sheets never cover the focused element; add `scroll-padding` when they could.
- 2.5.7 Dragging Movements: every drag action (reorder, slider, swipe) has a single-pointer alternative such as buttons or a menu.
- 3.3.7 Redundant Entry: never ask for data the user already entered in the same flow; prefill it or offer to reuse it.
- 3.3.8 Accessible Authentication: allow paste and password managers in credential fields (`autocomplete="current-password"`, `one-time-code`); no cognitive puzzles.
- Contrast at least 4.5:1 for text and 3:1 for UI components and focus rings; honour `prefers-reduced-motion`.

## Performance (Core Web Vitals, p75 of real users)

- Budgets: LCP <= 2.5 s, INP <= 200 ms, CLS <= 0.1. A PR that adds a route, a dependency or a hero asset states its effect on the budget.
- Split code per route with `lazy()` + `Suspense`; the route-lazy file is the only default export.
- Give every image and embed explicit `width`/`height` (or `aspect-ratio`) so layout never shifts.
- Keep event handlers short: wrap non-urgent state updates in `startTransition` and move heavy work off the input path. Why: INP reports close to the worst interaction on the page (about p98), not the average.
