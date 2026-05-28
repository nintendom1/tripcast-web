# Intro Dark Mode Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `IntroSequence` so selecting Dark (or Auto at night after a first interaction) on the final theme beat visually transitions the entire intro to the Constellation theme, while beats 0–4 always stay in Meadow light.

**Architecture:** Prop-drill a single `isDark` boolean derived in `IntroSequence` down to `IntroBackdrop`, `BeatScene`, `ThemeChoicePanel`, and `MapPreviewCard`. A `hasPickedTheme` guard ensures the theme beat always arrives in light mode regardless of auto-resolved theme. Global CSS variables are updated via the existing `setMode` call so functional tokens (`--bg-paper`, `--ink-1`, etc.) carry Constellation values when `isDark` is true.

**Tech Stack:** React, TypeScript, Tailwind CSS (arbitrary value classes), Framer Motion, Vitest + Testing Library

**Spec:** `docs/superpowers/specs/2026-05-27-intro-dark-mode-preview-design.md`  
**Gotcha:** Read `docs/agents/implementation-gotchas.md` § "Intro Sequence Theming" before touching any token names.  
**Commits & PRs:** Read `docs/agents/commit-and-pr.md` before committing or opening a PR. Subject lines are Imperative Title Case; bodies follow the "Before, X. Now, Y." format. Gitleaks scanning is part of PR work.

---

## File Map

| File | Change |
|---|---|
| `src/features/onboarding/IntroSequence.tsx` | All logic + visual changes (all tasks) |
| `src/features/onboarding/IntroSequence.test.tsx` | New tests for isDarkPreview guard and dark class behaviour |

No new files. No backend changes. No Convex API changes.

---

## Task 1: isDarkPreview Guard — State & Logic

**Files:**
- Modify: `src/features/onboarding/IntroSequence.tsx`
- Test: `src/features/onboarding/IntroSequence.test.tsx`

### Why this task first
All visual work in later tasks depends on `isDarkPreview` and `hasPickedTheme` existing. Get the logic right and verified before touching any styles.

---

- [ ] **Step 1: Add `motion.path` to the framer-motion mock**

The theme beat renders a `<motion.path>` inside `MapPreviewCard`. The existing mock only covers `motion.div` and `motion.h1` — without `motion.path`, any test that navigates to beat 5 will throw "React.createElement: type is invalid".

In `src/features/onboarding/IntroSequence.test.tsx`, extend the `motion` object inside `vi.mock("framer-motion", ...)`:

```tsx
motion: {
  div: ReactModule.forwardRef<HTMLDivElement, MotionProps<HTMLDivElement>>(
    ({ animate, initial: _initial, exit: _exit, transition: _transition, style, ...props }, ref) => (
      <div ref={ref} {...props} style={motionStyle<HTMLDivElement>({ animate, style })} />
    ),
  ),
  h1: ReactModule.forwardRef<HTMLHeadingElement, MotionProps<HTMLHeadingElement>>(
    ({ animate, initial: _initial, exit: _exit, transition: _transition, style, ...props }, ref) => (
      <h1 ref={ref} {...props} style={motionStyle<HTMLHeadingElement>({ animate, style })} />
    ),
  ),
  path: ReactModule.forwardRef<SVGPathElement, React.SVGProps<SVGPathElement> & { animate?: unknown; initial?: unknown; exit?: unknown; transition?: unknown }>(
    ({ animate: _a, initial: _i, exit: _e, transition: _t, ...props }, ref) => (
      <path ref={ref} {...props} />
    ),
  ),
},
```

---

- [ ] **Step 2: Write four failing tests**

Add a new `describe` block to `src/features/onboarding/IntroSequence.test.tsx` after the existing `describe("IntroSequence")` block:

```tsx
describe("IntroSequence — dark preview", () => {
  function navigateToThemeBeat() {
    act(() => {
      for (let i = 0; i < 5; i += 1) {
        fireEvent.click(screen.getByRole("button", { name: /next/i }));
      }
    });
  }

  it("theme beat arrives in light mode even when auto resolves to night", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T21:00:00"));
    localStorage.setItem("tripcast.theme_mode", "auto");
    render(
      <ThemeProvider>
        <IntroSequence role="follower" userHandle="alice" travelerName="Traveler" onDone={vi.fn()} />
      </ThemeProvider>,
    );
    navigateToThemeBeat();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(document.querySelector("[data-role='intro-sequence']")!).not.toHaveClass("dark");
  });

  it("intro div gains dark class when Dark button is tapped", () => {
    localStorage.setItem("tripcast.theme_mode", "meadow");
    render(
      <ThemeProvider>
        <IntroSequence role="follower" userHandle="alice" travelerName="Traveler" onDone={vi.fn()} />
      </ThemeProvider>,
    );
    navigateToThemeBeat();
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(document.querySelector("[data-role='intro-sequence']")!).toHaveClass("dark");
  });

  it("dark class clears when navigating back from theme beat", () => {
    localStorage.setItem("tripcast.theme_mode", "meadow");
    render(
      <ThemeProvider>
        <IntroSequence role="follower" userHandle="alice" travelerName="Traveler" onDone={vi.fn()} />
      </ThemeProvider>,
    );
    navigateToThemeBeat();
    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    fireEvent.click(screen.getByRole("button", { name: /previous intro frame/i }));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(document.querySelector("[data-role='intro-sequence']")!).not.toHaveClass("dark");
  });

  it("auto mode shows dark preview after user first interacts at night", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T21:00:00"));
    localStorage.setItem("tripcast.theme_mode", "meadow");
    render(
      <ThemeProvider>
        <IntroSequence role="follower" userHandle="alice" travelerName="Traveler" onDone={vi.fn()} />
      </ThemeProvider>,
    );
    navigateToThemeBeat();
    // Tap Light first (sets hasPickedTheme=true), then tap Auto — should resolve dark
    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    fireEvent.click(screen.getByRole("button", { name: "Auto" }));
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(document.querySelector("[data-role='intro-sequence']")!).toHaveClass("dark");
  });
});
```

- [ ] **Step 3: Run tests — verify they all fail**

```bash
cd tripcast-web && npm run test -- IntroSequence
```

Expected: 4 new tests FAIL. Existing tests should still pass.

---

- [ ] **Step 4: Implement `hasPickedTheme` state, updated `isDarkPreview`, updated `chooseTheme`**

In `src/features/onboarding/IntroSequence.tsx`, inside the `IntroSequence` function body, make these three changes:

**Add `hasPickedTheme` state** immediately after the existing `themeChoice` state line:

```tsx
const [themeChoice, setThemeChoice] = React.useState<ThemeMode>(mode);
const [hasPickedTheme, setHasPickedTheme] = React.useState(false);
```

**Replace the `isDarkPreview` line** with:

```tsx
const isDarkPreview = isThemeBeat && (
  themeChoice === "constellation" ||
  (themeChoice === "auto" && resolvedTheme === "constellation" && hasPickedTheme)
);
```

**Replace the `chooseTheme` callback** with:

```tsx
const chooseTheme = React.useCallback((nextMode: ThemeMode) => {
  setThemeChoice(nextMode);
  setHasPickedTheme(true);
  setMode(nextMode);
  log.logUi("intro:theme-select", {
    mode: nextMode,
    resolvedTheme: nextMode === "auto" ? resolvedTheme : nextMode,
    source,
  });
}, [log, resolvedTheme, setMode, source]);
```

---

- [ ] **Step 5: Run tests — verify all 4 new tests pass**

```bash
npm run test -- IntroSequence
```

Expected: all tests in `IntroSequence.test.tsx` pass, including the 4 new ones.

---

- [ ] **Step 6: Commit**

```bash
git add src/features/onboarding/IntroSequence.tsx src/features/onboarding/IntroSequence.test.tsx
git commit -m "$(cat <<'EOF'
feat: Add HasPickedTheme Guard for Dark Preview

Before, the theme beat immediately showed the dark preview if the user's
auto mode resolved to night on arrival, removing user agency.
Now, a hasPickedTheme flag ensures the theme beat always starts in Meadow
light until the user makes an explicit theme choice.
EOF
)"
```

---

## Task 2: Root Container & Nav Token Swap

**Files:**
- Modify: `src/features/onboarding/IntroSequence.tsx`

The dark class on the root `div` is already tested by Task 1's tests. This task wires it up visually.

---

- [ ] **Step 1: Replace the root `div` opening tag**

Find the `<div ref={rootRef} data-role="intro-sequence" ...>` opening tag in the `IntroSequence` return and replace its `className` prop:

```tsx
<div
  ref={rootRef}
  data-role="intro-sequence"
  className={cn(
    "fixed inset-0 z-[60] overflow-hidden transition-colors duration-500",
    isDarkPreview && "dark",
    isDarkPreview
      ? "bg-[var(--bg-paper)] text-[var(--ink-1)]"
      : "bg-[var(--meadow-bg)] text-[var(--meadow-ink)]"
  )}
  onClick={() => {
    if (!isThemeBeat) {
      advance("surface-click");
    }
  }}
>
```

---

- [ ] **Step 2: Replace the Back button `className`**

```tsx
<button
  type="button"
  onClick={(event) => {
    event.stopPropagation();
    previous("back-button");
  }}
  className={cn(
    "absolute left-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border shadow-[var(--shadow-card)] backdrop-blur transition-all",
    isDarkPreview
      ? "border-[var(--ink-3)] bg-[var(--card)]/70 text-[var(--ink-2)]"
      : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)]/70 text-[var(--meadow-ink-soft)]"
  )}
  aria-label="Previous intro frame"
>
  <ChevronLeft className="h-4 w-4" aria-hidden />
</button>
```

---

- [ ] **Step 3: Replace the Skip button `className`**

```tsx
<button
  type="button"
  onClick={skip}
  className={cn(
    "absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full border shadow-[var(--shadow-card)] backdrop-blur transition-all",
    isDarkPreview
      ? "border-[var(--ink-3)] bg-[var(--card)]/80 text-[var(--ink-2)]"
      : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)]/80 text-[var(--meadow-ink-soft)]"
  )}
  aria-label="Skip"
>
  <X className="h-4 w-4" aria-hidden />
</button>
```

---

- [ ] **Step 4: Replace the progress dots `style` prop**

Find the `{BEATS.map((_, i) => (` block and replace the `<span>` inside it:

```tsx
{BEATS.map((_, i) => (
  <span
    key={i}
    className={cn("h-1.5 rounded-full transition-all duration-300", i === safeBeat ? "w-6" : "w-1.5")}
    style={{
      background: i <= safeBeat
        ? (isDarkPreview ? "var(--flag)" : "var(--meadow-primary)")
        : (isDarkPreview ? "var(--ink-3)" : "var(--meadow-paper-edge)")
    }}
  />
))}
```

---

- [ ] **Step 5: Replace the CTA `Button` style prop**

```tsx
<Button
  type="button"
  onClick={(event) => {
    event.stopPropagation();
    advance("cta");
  }}
  className="mt-8 h-12 rounded-full px-7 font-[var(--meadow-font-display)] text-base font-extrabold"
  style={{
    background: isDarkPreview ? "var(--flag)" : "var(--meadow-primary)",
    color: isDarkPreview ? "white" : "var(--meadow-primary-ink)",
  }}
>
  {current.cta}
  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
</Button>
```

---

- [ ] **Step 6: Run validate**

```bash
npm run validate
```

Expected: typecheck, lint, and tests all pass.

---

- [ ] **Step 7: Commit**

```bash
git add src/features/onboarding/IntroSequence.tsx
git commit -m "$(cat <<'EOF'
feat: Wire Root Container and Nav Token Swap for Dark Preview

Before, the intro root div, back/skip buttons, progress dots, and CTA
always used static Meadow brand tokens regardless of the selected theme.
Now, all nav elements switch to Constellation functional tokens when
isDarkPreview is true, completing the visual dark mode container.
EOF
)"
```

---

## Task 3: IntroBackdrop — Night Effects

**Files:**
- Modify: `src/features/onboarding/IntroSequence.tsx`

Restructures the backdrop so sun/moon and clouds render on **all beats** (not just non-theme beats), enabling the sun→moon and cloud fade-out transitions to fire when `isDark` becomes true on the theme beat.

---

- [ ] **Step 1: Replace the entire `IntroBackdrop` function**

```tsx
function IntroBackdrop({ beat, isDark }: { beat: number; isDark?: boolean }) {
  const isThemeBeat = beat === LAST_BEAT_INDEX;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Light radial — fades out when isDark */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-1000",
          isDark ? "opacity-0" : "opacity-100"
        )}
        style={{ background: "radial-gradient(circle_at_50%_35%,var(--meadow-paper)_0%,var(--meadow-bg)_66%)" }}
      />

      {/* Dark radial — fades in when isDark */}
      <div
        className={cn(
          "absolute inset-0 transition-opacity duration-1000",
          isDark ? "opacity-100" : "opacity-0"
        )}
        style={{ background: "radial-gradient(circle_at_50%_35%,#1a1c2c_0%,#0c0d14_66%)" }}
      />

      {/* Sun / Moon — all beats so the transition fires on the theme beat */}
      <motion.div
        className={cn(
          "absolute right-10 top-16 h-24 w-24 rounded-full transition-colors duration-1000",
          isDark ? "bg-slate-200/20" : "bg-[var(--meadow-gold)]/40"
        )}
        animate={{ scale: beat % 2 === 0 ? 1 : 1.08, opacity: [0.45, 0.7, 0.45] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Clouds — all beats; fade out when isDark so the transition fires on the theme beat */}
      <div
        className={cn(
          "absolute left-8 top-32 h-10 w-28 rounded-full bg-white/65 transition-opacity duration-700",
          isDark ? "opacity-0" : "opacity-100"
        )}
      />
      <div
        className={cn(
          "absolute right-16 top-44 h-8 w-24 rounded-full bg-white/55 transition-opacity duration-700",
          isDark ? "opacity-0" : "opacity-100"
        )}
      />

      {/* Ground haze — non-theme beats only (would compete with ThemeChoicePanel) */}
      {!isThemeBeat && (
        <div className="absolute -bottom-16 left-1/2 h-48 w-[120%] -translate-x-1/2 rounded-[50%] bg-[var(--meadow-forest)]/10" />
      )}

      {/* Subtle grid overlay — theme beat only */}
      {isThemeBeat && (
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
      )}

      {/* Starfield — theme beat + dark only; golden dots pulse subtly */}
      {isThemeBeat && isDark && (
        <motion.div
          className="absolute inset-0"
          animate={{ opacity: [0.04, 0.14, 0.04] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{
            backgroundImage: [
              "radial-gradient(circle, #ffd86a 1px, transparent 1px)",
              "radial-gradient(circle, #ffd86a 1px, transparent 1px)",
              "radial-gradient(circle, #ffd86a 1.5px, transparent 1.5px)",
              "radial-gradient(circle, #ffd86a 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "120px 80px, 90px 110px, 150px 70px, 80px 130px",
            backgroundPosition: "20px 15px, 60px 45px, 10px 70px, 80px 10px",
          }}
        />
      )}
    </div>
  );
}
```

---

- [ ] **Step 2: Run validate**

```bash
npm run validate
```

Expected: all pass.

---

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/IntroSequence.tsx
git commit -m "$(cat <<'EOF'
feat: Restructure IntroBackdrop With Night Effects and Starfield

Before, sun/moon and clouds were hidden on the theme beat, making the
dark mode cloud-fade and sun-to-moon transitions no-ops.
Now, atmospheric elements render on all beats and transition smoothly
when isDark fires; a pulsing golden starfield appears on the dark theme beat.
EOF
)"
```

---

## Task 4: BeatScene Token Updates

**Files:**
- Modify: `src/features/onboarding/IntroSequence.tsx`

Updates the mascot speech bubble, kicker pill, and title `h1` to switch between Meadow brand tokens and functional tokens based on `isDark`.

---

- [ ] **Step 1: Replace the entire `BeatScene` function**

```tsx
function BeatScene({
  beat,
  current,
  userHandle,
  travelerName,
  isDark,
}: {
  beat: number;
  current: Beat;
  userHandle: string;
  travelerName: string;
  isDark?: boolean;
}) {
  const Icon = current.Icon;
  const pose = beat === 0 ? "wave" : beat === 4 ? "cheer" : beat === 5 ? "idle" : "point";

  return (
    <div className="grid w-full max-w-sm translate-y-3 justify-items-center text-center">
      <div className="mb-5 h-32 w-full">
        <SceneCard beat={beat} isDark={isDark} />
      </div>
      <div className="mb-8 grid w-full grid-cols-[82px_minmax(0,1fr)] items-end gap-3">
        <IntroMascot pose={pose} size={3.4} />
        <div
          className={cn(
            "min-w-0 rounded-2xl border px-4 py-3 text-left text-sm font-semibold leading-snug shadow-[var(--shadow-card)] transition-colors duration-500",
            isDark
              ? "border-[var(--ink-3)] bg-[var(--card)] text-[var(--foreground)]"
              : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)] text-[var(--meadow-ink)]"
          )}
        >
          {beat === 0
            ? `Hi @${userHandle}. ${current.body}`
            : beat === 1
              ? `${travelerName} posts the moments. You get the thread.`
              : current.body}
        </div>
      </div>
      <div
        className={cn(
          "mb-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-[var(--meadow-font-display)] text-[11px] font-extrabold uppercase tracking-[0.12em] transition-colors duration-500",
          isDark
            ? "border-[var(--ink-3)] bg-[var(--card)] text-[var(--ink-2)]"
            : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)] text-[var(--meadow-ink-soft)]"
        )}
      >
        <Icon
          className={cn(
            "h-3.5 w-3.5 transition-colors",
            isDark ? "text-[var(--flag)]" : "text-[var(--meadow-primary)]"
          )}
          aria-hidden
        />
        {current.kicker}
      </div>
      <h1
        className={cn(
          "font-[var(--meadow-font-display)] text-3xl font-extrabold leading-tight transition-colors duration-500",
          isDark ? "text-[var(--foreground)]" : "text-[var(--meadow-ink)]"
        )}
      >
        {current.title}
      </h1>
    </div>
  );
}
```

---

- [ ] **Step 2: Run validate**

```bash
npm run validate
```

Expected: all pass.

---

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/IntroSequence.tsx
git commit -m "$(cat <<'EOF'
feat: Update BeatScene Token Swap for Dark Preview

Before, the mascot speech bubble, kicker pill, and title heading always
used Meadow brand tokens regardless of isDark.
Now, all three elements switch to Constellation functional tokens when
isDark is true, completing the in-beat dark mode appearance.
EOF
)"
```

---

## Task 5: ThemeChoicePanel isDark Prop

**Files:**
- Modify: `src/features/onboarding/IntroSequence.tsx`

Passes `isDark` to `ThemeChoicePanel` and updates the active/inactive button tokens.

---

- [ ] **Step 1: Add `isDark` to the `ThemeChoicePanel` call site**

In the `IntroSequence` return JSX, find `<ThemeChoicePanel` and add the prop:

```tsx
{isThemeBeat ? (
  <ThemeChoicePanel
    value={themeChoice}
    resolvedTheme={resolvedTheme}
    onChange={chooseTheme}
    isDark={isDarkPreview}
  />
) : null}
```

---

- [ ] **Step 2: Replace the entire `ThemeChoicePanel` function**

```tsx
function ThemeChoicePanel({
  value,
  resolvedTheme,
  onChange,
  isDark,
}: {
  value: ThemeMode;
  resolvedTheme: "meadow" | "constellation";
  onChange: (mode: ThemeMode) => void;
  isDark?: boolean;
}) {
  const choices: Array<{ mode: ThemeMode; label: string; Icon: LucideIcon }> = [
    { mode: "meadow", label: "Light", Icon: Sun },
    { mode: "constellation", label: "Dark", Icon: Moon },
    { mode: "auto", label: "Auto", Icon: Sparkles },
  ];

  return (
    <div
      className="mt-6 grid w-full max-w-sm gap-3"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="grid grid-cols-3 gap-2">
        {choices.map(({ mode, label, Icon }) => {
          const active = value === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              aria-pressed={active}
              className={cn(
                "grid min-h-20 justify-items-center gap-2 rounded-2xl border px-2 py-3 font-[var(--meadow-font-display)] text-sm font-extrabold shadow-[var(--shadow-card)] transition-all active:scale-[0.98]",
                active
                  ? isDark
                    ? "border-[var(--flag)] bg-[var(--flag)] text-[var(--ink-on-brand)]"
                    : "border-[var(--meadow-primary)] bg-[var(--meadow-primary)] text-[var(--meadow-primary-ink)]"
                  : isDark
                    ? "border-[var(--ink-3)] bg-[var(--card)] text-[var(--foreground)]"
                    : "border-[var(--meadow-paper-edge)] bg-[var(--meadow-paper)] text-[var(--meadow-ink)]"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>
      {value === "auto" ? (
        <p
          className={cn(
            "text-center font-[var(--meadow-font-mono,var(--font-mono))] text-[10px] font-bold uppercase tracking-[0.14em] transition-colors duration-500",
            isDark ? "text-[var(--ink-3)]" : "text-[var(--meadow-ink-soft)]"
          )}
        >
          Auto will open in {resolvedTheme === "constellation" ? "dark" : "light"} mode now
        </p>
      ) : null}
    </div>
  );
}
```

---

- [ ] **Step 3: Run validate**

```bash
npm run validate
```

Expected: all pass.

---

- [ ] **Step 4: Commit**

```bash
git add src/features/onboarding/IntroSequence.tsx
git commit -m "$(cat <<'EOF'
feat: Update ThemeChoicePanel With isDark Prop and Token Swap

Before, ThemeChoicePanel active and inactive choice buttons always used
Meadow tokens, appearing visually inconsistent in the dark preview.
Now, buttons switch to Constellation tokens (flag amber for active,
card/foreground for inactive) when isDark is true.
EOF
)"
```

---

## Task 6: MapPreviewCard — Liberty / Fiord Mock

**Files:**
- Modify: `src/features/onboarding/IntroSequence.tsx`

Updates the mock map preview to match Liberty (light) and Fiord (dark) tile colours. `SceneCard` already routes to `MapPreviewCard` on the theme beat — only the function body changes.

---

- [ ] **Step 1: Replace the entire `MapPreviewCard` function**

```tsx
function MapPreviewCard({ isDark }: { isDark?: boolean }) {
  return (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-[26px] border shadow-[var(--shadow-card)] transition-colors duration-500",
        isDark ? "bg-[#1a1c2c] border-[#2d314d]" : "bg-[#eaf2da] border-[var(--meadow-paper-edge)]"
      )}
    >
      {/* Terrain blobs — land regions */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: isDark
            ? "radial-gradient(circle at 20% 30%, #24273a 0%, transparent 40%), radial-gradient(circle at 80% 70%, #24273a 0%, transparent 40%)"
            : "radial-gradient(circle at 20% 30%, #bcd58a 0%, transparent 40%), radial-gradient(circle at 80% 70%, #bcd58a 0%, transparent 40%)",
        }}
      />

      {/* Route line + waypoints */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100">
        <motion.path
          d="M 20 80 Q 40 20 80 40"
          fill="none"
          stroke={isDark ? "#ffd86a" : "#444444"}
          strokeWidth="3"
          strokeDasharray="6 4"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "linear" }}
        />
        <circle cx="20" cy="80" r="3.5" fill="var(--flag)" />
        <circle cx="80" cy="40" r="3.5" fill="var(--flag)" />
      </svg>

      {/* Cartographic grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
    </div>
  );
}
```

---

- [ ] **Step 2: Run validate**

```bash
npm run validate
```

Expected: all pass.

---

- [ ] **Step 3: Commit**

```bash
git add src/features/onboarding/IntroSequence.tsx
git commit -m "$(cat <<'EOF'
feat: Update MapPreviewCard With Liberty and Fiord Mock Colours

Before, the theme beat scene card used placeholder styling with no
connection to the app's actual map colour palette.
Now, it mirrors Liberty tile colours in light mode and Fiord in dark,
with an animated amber route line and flag-coloured waypoint dots.
EOF
)"
```

---

## Task 7: Final Validate & Smoke Check

**Files:** none (verification only)

---

- [ ] **Step 1: Run full validate**

```bash
npm run validate
```

Expected output ends with something like:
```
✓ src/features/onboarding/IntroSequence.test.tsx (7)
```
All tests pass, no type errors, no lint errors.

---

- [ ] **Step 2: Manual smoke check (dev server required — agent skip, human verify)**

1. `npm run dev` → open the app → trigger the intro (new account or options replay)
2. Navigate to beat 5 (theme beat) — background should be Meadow light regardless of time of day
3. Tap **Dark** — background, map preview, speech bubble, and buttons all transition to Constellation
4. Tap **Light** — reverts to Meadow
5. Tap **Light**, then **Auto** at night — preview goes dark; status text reads "Auto will open in dark mode now"
6. Tap **Dark**, click **Back** — UI immediately returns to Meadow light on beat 4
7. Return to beat 5 — Dark is still selected and preview is dark
8. Tap **Dark**, click **Open the map** — app opens in Constellation theme

---

- [ ] **Step 3: Commit if any fixes were needed; otherwise done**

```bash
git add -p
git commit -m "fix(onboarding): <describe any fixup>"
```

---

## Verification Checklist (from spec)

| # | Check | Task |
|---|---|---|
| 1 | Theme beat arrives in light mode regardless of auto+night | Task 1 |
| 2 | Selecting Dark transitions background, map, bubble, buttons smoothly | Tasks 2–5 |
| 3 | Selecting Light reverts to Meadow | Task 2 |
| 4 | Auto+night shows dark after first interaction | Task 1 |
| 5 | Tapping Dark then Back → immediate Meadow revert | Task 1 |
| 6 | Returning to theme beat preserves prior selection | Task 1 |
| 7 | MapPreviewCard: Liberty colours in light, Fiord in dark, route animates | Task 6 |
| 8 | Starfield appears only on dark theme beat, pulses with golden dots | Task 3 |
| 9 | `npm run validate` passes | All tasks |
