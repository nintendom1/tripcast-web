# Design: Intro Sequence Dark Mode Preview

**Date:** 2026-05-27  
**Scope:** `tripcast-web` — `IntroSequence` and sub-components only  
**Approach:** Prop-drilling (`isDark` passed down); no new context or global state beyond `setMode`

---

## Theming Mechanism

The intro uses **two token families** that must never be mixed:

- **Meadow brand tokens** (`--meadow-bg`, `--meadow-ink`, `--meadow-primary`, etc.) — static, always light. Defined once in CSS and never changed by ThemeProvider. Beats 0–4 use these exclusively and are therefore immune to any global theme change.
- **Functional tokens** (`--bg-paper`, `--ink-1`, `--card`, `--foreground`, etc.) — dynamic, set as inline styles on `document.documentElement` by `applyThemeVariables()` inside ThemeProvider. They carry Meadow values by default and Constellation values after `setMode("constellation")` is called.

**Why `setMode` must be called in `chooseTheme`:** When `isDarkPreview` is true, the theme beat components switch to functional tokens. For those tokens to hold dark values, `applyThemeVariables("constellation")` must have already run. Calling `setMode("constellation")` in `chooseTheme` triggers that path inside ThemeProvider. Without it, functional tokens still carry Meadow values and the dark preview renders with the wrong colors.

**Why the `.dark` class on the root div is not sufficient:** TripCast CSS variables are set as inline styles on `:root` via JavaScript — not via a `.dark { ... }` CSS rule. Adding `.dark` to a child div does not change any CSS variable values. It is added as a conventional marker only (e.g., for any incidental Tailwind dark variants). The actual visual switching is done entirely by explicit `isDark`-conditional token selection in each component.

**Global theme side-effect is safe:** The intro sits at `z-[60]` and covers the full viewport. Calling `setMode` during the intro changes global CSS vars but nothing behind the overlay is visible. When the user finishes, the theme is already correctly set for the rest of the app.

---

## Objective

New users can pick and *see* their theme before the map opens. Selecting "Dark" (or "Auto" when the clock resolves to night, after a first explicit tap) on the final beat visually transforms the intro into the Constellation theme. Beats 0–4 remain in the light Meadow brand theme at all times. Navigating back from the final beat reverts the intro to Meadow immediately.

---

## Section 1 — State & Core Logic (`IntroSequence`)

### State

| State | Init | Purpose |
|---|---|---|
| `themeChoice: ThemeMode` | `mode` (persisted setting) | Drives pre-selected button |
| `hasPickedTheme: boolean` | `false` | Guards auto-at-night from firing on arrival |

### Derived boolean

```ts
const isDarkPreview = isThemeBeat && (
  themeChoice === "constellation" ||
  (themeChoice === "auto" && resolvedTheme === "constellation" && hasPickedTheme)
);
```

### Behavior by initial mode

- `mode = "meadow"` → `isDarkPreview` never fires ✓
- `mode = "constellation"` → fires immediately on theme beat (user already chose dark) ✓
- `mode = "auto"`, nighttime → stays off until first explicit tap ✓

### `chooseTheme(nextMode)`

Sets `themeChoice`, sets `hasPickedTheme(true)`, calls `setMode(nextMode)`.  
`setMode` is required so the global CSS functional tokens (`--bg-paper`, `--ink-1`, etc.) carry Constellation values when `isDarkPreview` is true.

`hasPickedTheme` does **not** reset on back-navigation — returning to the theme beat after going back shows the prior selection.

---

## Section 2 — Root Container, Navigation & Progress Dots

### Root `div`

```
transition-colors duration-500
isDarkPreview && "dark"
isDarkPreview → bg-[var(--bg-paper)] text-[var(--ink-1)]
else          → bg-[var(--meadow-bg)] text-[var(--meadow-ink)]
```

### Back button & Skip (×) button

| State | Classes |
|---|---|
| Dark | `border-[var(--ink-3)] bg-[var(--card)]/{70\|80} text-[var(--ink-2)]` |
| Light | `border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)]/{70\|80} text-[var(--meadow-ink-soft)]` |

### Progress dots

| Part | Dark | Light |
|---|---|---|
| Active / completed fill | `var(--flag)` | `var(--meadow-primary)` |
| Inactive fill | `var(--ink-3)` | `var(--meadow-paper-edge)` |

### CTA button

| State | Background | Color |
|---|---|---|
| Dark | `var(--flag)` | `white` |
| Light | `var(--meadow-primary)` | `var(--meadow-primary-ink)` |

---

## Section 3 — IntroBackdrop

Props: `beat: number`, `isDark?: boolean`

### Background layers (opacity-transitioned, `duration-1000`)

| Layer | Visible when |
|---|---|
| Light radial (`meadow-paper → meadow-bg`) | `!isDark` |
| Dark radial (`#1a1c2c → #0c0d14`) | `isDark` |

Both layers render on all beats including the theme beat. On the theme beat the radial sits behind the MapPreviewCard and ThemeChoicePanel — it provides the atmospheric backdrop for the theme preview.

### Sun / Moon (all beats)

- Light: `bg-[var(--meadow-gold)]/40`, scale pulse 1→1.08, 3s loop
- Dark: `bg-slate-200/20`, same animation
- `transition-colors duration-1000`

Rendered on all beats so the sun→moon transition is visible when the user picks Dark on the theme beat.

### Clouds (all beats)

Two pill-shaped white divs; add `transition-opacity duration-700`.  
`isDark` → `opacity-0`, else `opacity-100`.

Rendered on all beats so the fade-out fires when `isDark` becomes true on the theme beat.

### Ground haze (non-theme beats only)

Bottom ellipse `bg-[var(--meadow-forest)]/10`; removed on the theme beat — it would visually compete with the ThemeChoicePanel at the bottom of the screen.

### Starfield (theme beat + dark only)

Single `div` with:
```css
background: repeating-radial-gradient(
  circle at [varied positions],
  #ffd86a [dot size],
  transparent [gap]
);
opacity: 0.08 base;
animation: pulse 4s ease-in-out infinite; /* oscillates opacity 0.04 → 0.14 */
```

Color `#ffd86a` matches constellation `--amber` — reads as golden stars against the dark navy.

---

## Section 4 — BeatScene

Props: `beat`, `current`, `userHandle`, `travelerName`, `isDark?: boolean`  
Passes `isDark` to `SceneCard`.

### Mascot speech bubble

| State | Classes |
|---|---|
| Dark | `border-[var(--ink-3)] bg-[var(--card)] text-[var(--foreground)]` |
| Light | `border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)] text-[var(--meadow-ink)]` |

Add `transition-colors duration-500`.

### Kicker pill

| Part | Dark | Light |
|---|---|---|
| Border / bg / text | `ink-3 / card / ink-2` | `meadow-paper-edge / meadow-paper / meadow-ink-soft` |
| Icon | `text-[var(--flag)]` | `text-[var(--meadow-primary)]` |

Add `transition-colors duration-500`.

### Title `h1`

- Dark: `text-[var(--foreground)]`
- Light: `text-[var(--meadow-ink)]`
- Add `transition-colors duration-500`

### Mascot (`PixelChar`)

Already uses `var(--ink-1)` for outlines — automatically correct when global theme changes. No prop change required.

### Non-theme beat SceneCards (beats 0–4)

Always Meadow-branded; `isDark` is forwarded but ignored in their render branches.

---

## Section 5 — ThemeChoicePanel

Props: `value`, `resolvedTheme`, `onChange`, `isDark?: boolean`

### Choice buttons (Light / Dark / Auto)

| Variant | Dark | Light |
|---|---|---|
| **Inactive** | `border-[var(--ink-3)] bg-[var(--card)] text-[var(--foreground)]` | `border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)] text-[var(--meadow-ink)]` |
| **Active** | `border-[var(--flag)] bg-[var(--flag)] text-[var(--ink-on-brand)]` | `border-[var(--meadow-primary)] bg-[var(--meadow-primary)] text-[var(--meadow-primary-ink)]` |

`var(--flag)` for dark active keeps accent color consistent with the CTA button and progress dots.

### Auto status line

- Dark: `text-[var(--ink-3)]`
- Light: `text-[var(--meadow-ink-soft)]`
- Add `transition-colors duration-500`

---

## Section 6 — MapPreviewCard

Props: `isDark?: boolean`

A CSS/SVG mock that mirrors Liberty (light) and Fiord (dark) tile colors.

### Container

| State | Background | Border |
|---|---|---|
| Dark | `#1a1c2c` (constellation `--bg-paper`) | `#2d314d` |
| Light | `#eaf2da` (Liberty land) | `var(--meadow-paper-edge)` |

Add `transition-colors duration-500`, `overflow-hidden rounded-[26px]`.

### Background texture (low-opacity radial blobs)

- Dark: two `radial-gradient` blobs at `#24273a` — suggests landmass
- Light: two `radial-gradient` blobs at `#bcd58a` — suggests parks/terrain

### Animated route line (SVG)

- Path: a gentle curve across the card
- Dark stroke: `#ffd86a` (constellation amber), dashed
- Light stroke: `#444444`, dashed
- Framer Motion `pathLength` 0→1, 2.5s, `repeat: Infinity`

### Waypoint dots

- Both modes: `fill: var(--flag)` — orange in light, amber in dark, driven by the active global theme

### Grid overlay

- `opacity-[0.08]`, `currentColor` 20×20px lines — inherits container text color automatically

---

## Edge Cases

| Case | Behaviour |
|---|---|
| Auto, nighttime, first arrival at theme beat | `hasPickedTheme = false` → `isDarkPreview = false` → light mode |
| Auto, user taps Light then back to Auto, nighttime | `hasPickedTheme = true` → `isDarkPreview = true` → dark preview |
| User taps Dark then clicks Back | `isThemeBeat = false` → `isDarkPreview = false` → Meadow colors immediately |
| User returns to theme beat after Back | Prior `themeChoice` and `hasPickedTheme` preserved → preview resumes correctly |
| `mode = "constellation"` on first load | `themeChoice = "constellation"` → dark preview active on theme beat arrival |

---

## Verification Checklist

1. Navigate to theme beat — UI is in Meadow light regardless of time of day or stored mode
2. Tap "Dark" — background, map preview, mascot bubble, buttons all transition to Constellation smoothly
3. Tap "Light" — reverts to Meadow
4. Tap "Auto" without prior interaction (nighttime) — stays light; tap "Light" then "Auto" — goes dark
5. Tap "Dark", click Back — UI immediately returns to Meadow light on beat 4
6. Return to theme beat after Back — prior dark selection is preserved
7. MapPreviewCard: light version shows green land + dark dashes; dark version shows navy + amber dashes with animated route
8. Starfield appears only on theme beat in dark preview; golden dots pulse subtly
9. `npm run validate` passes
