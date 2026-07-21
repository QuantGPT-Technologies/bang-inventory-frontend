## QGPT Production Tracker UI — build conventions

**No wrapper needed.** Every component is a plain, standalone React function — there is no ThemeProvider, context, or root wrapper to set up. Just import and render.

**Styling idiom: Tailwind utility classes + CSS custom-property tokens.** This system is styled with Tailwind CSS, but all brand color comes from CSS custom properties applied via Tailwind's arbitrary-value syntax (`bg-[var(--accent)]`), never hex literals or Tailwind's default palette (no `bg-blue-600`, `text-gray-900`, etc. for brand surfaces). The token set, defined in `styles.css`:

| Token | Use |
|---|---|
| `--paper`, `--paper-dark`, `--paper-darker` | page/card backgrounds, from lightest to darkest |
| `--ink`, `--ink-light`, `--ink-muted` | text, from primary to de-emphasized |
| `--accent`, `--accent-light`, `--accent-muted` | primary brand action color (buttons, active states) |
| `--gold`, `--gold-light` | secondary accent |
| `--green`, `--green-light` | success/positive accent |
| `--border`, `--border-light` | borders and dividers |
| `--shadow` | box-shadow color, used as `shadow-[0_1px_4px_var(--shadow)]` |

When composing new layout around these components, reuse these tokens the same way (`className="bg-[var(--paper-dark)] border border-[var(--border)]"`) rather than introducing new colors. Ordinary Tailwind spacing/layout/typography utilities (`flex`, `gap-4`, `rounded-lg`, `text-sm`, etc.) are used freely alongside the tokens.

**Fonts.** Three families are loaded via a Google Fonts `@import` in `styles.css` (not shipped as local files): `Inter` (default sans/body), `Playfair Display` (display/serif headings), `JetBrains Mono` (monospace, e.g. for codes/IDs). Reference them as `font-sans`, `font-display` (mapped via `@theme inline`), or `font-mono`.

**Where the truth lives.** Read `styles.css` (the token/font source) and each component's own `.prompt.md` before styling. This system has no separate design-guideline docs — the shipped source is the only reference.

**Example — composing a status row:**

```tsx
import { Badge, Button, Card } from 'bang-inventory-ui';

<Card title="Batch #BW-1042" subtitle="Started 2 days ago" action={<Badge variant="info">In Progress</Badge>}>
  <div className="flex items-center justify-between">
    <p className="text-sm text-[var(--ink-light)]">4 lots blended, pending QA sign-off.</p>
    <Button variant="primary" size="sm">Review</Button>
  </div>
</Card>
```
