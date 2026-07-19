# design-sync notes — bang-inventory-ui

## Repo shape

This repo is a Next.js **application**, not a standalone design-system package. There is no `dist/`, no separate `package.json` for the UI kit, and no Storybook. The synced surface is just `src/components/ui/` (10 files, 12 exported components — Card.tsx and Table.tsx each export two components; Badge.tsx and Toast.tsx also export non-component helper functions that the converter correctly excludes).

## How the synth-entry build is wired

The converter's `package` shape needs a real `PKG_DIR` on disk (it calls `realpathSync` on it), so a minimal fake package was created at `node_modules/bang-inventory-ui/`:
- `node_modules/bang-inventory-ui/package.json` — `{"name": "bang-inventory-ui", "version": "0.1.0"}`, no build fields, so the converter always falls back to synth-entry mode (barrel-exports every file under `cfg.srcDir`).
- `node_modules/bang-inventory-ui/dist/styles.css` — a **copy** of a Tailwind v4 build, not a symlink (`cfg.cssEntry` is bounded to inside `PKG_DIR`, so a symlink pointing outside gets rejected by the containment check).

`cfg.srcDir` (`../../src/components/ui`) and `cfg.tsconfig` (`../../tsconfig.json`) are relative to that fake `PKG_DIR`, not repo root — that's why they walk up two levels.

**Re-sync risk:** if `src/components/ui` gains new files or the Tailwind theme in `src/app/globals.css` changes, the copied `dist/styles.css` goes stale. Regenerate it before every rebuild — the fake package dir (`node_modules/bang-inventory-ui/`) is gitignored (it lives under `node_modules`) so recreate its `package.json` too on a fresh clone (see above):

```sh
node .design-sync/compile-css.mjs   # compiles src/app/globals.css via @tailwindcss/postcss → node_modules/bang-inventory-ui/dist/styles.css
```

Needs `postcss` + `@tailwindcss/postcss`, both already in `node_modules` from the app's own build.

Because Tailwind v4's automatic content detection scans the whole repo, the compiled CSS captures every utility class used anywhere in the app, not just in `src/components/ui` — harmless (extra unused rules) but means the stylesheet isn't minimal to just the synced components.

## Render check / grading — not machine-verified

Playwright/Chromium was never installed in this environment (user declined the ~200MB download both times it was offered). Consequences:
- `package-validate.mjs` and `resync.mjs` were run with `--no-render-check`.
- `package-capture.mjs` (screenshot-based absolute grading, §4.3) could not run at all — no `.design-sync/.cache/review/*.grade.json` files exist, and the driver's `pendingGrade` list is non-empty for all 12 components.
- Instead, the user reviewed the live `.review.html` page in their own browser (`node .ds-sync/storybook/http-serve.mjs ./ds-bundle`) and confirmed all 12 previews looked correct (styled, realistic content, nothing broken).

**Re-sync risk:** a future re-sync with playwright installed will treat every component as never-graded (no anchor for grades) and should do a full capture + grade pass — this is expected, not a bug, since no grade state was ever recorded this run.

## Known render warns

None recorded — no automated render check was run to produce any.

## Grouping

All 12 components landed in the `general` group (no `docsDir`/docs to derive a category from). Not regrouped — repo is small enough that it wasn't worth hand-authoring `docsMap` stub files just to split into subgroups.

## Fonts

`Inter`, `Playfair Display`, `JetBrains Mono` load via a Google Fonts `@import` in `globals.css` — flagged `[FONT_REMOTE]`, informational only, no action needed (fonts load at runtime from Google's CDN).
