# Hajun Arcade Design Contract

## Source of truth

- This file is the product and UI source of truth for the current Hajun Arcade implementation.
- Runtime behavior remains defined by the React/Three.js code and the tested game-rule modules.
- Game routes are `/play/three-cushion`, `/play/four-ball`, and `/play/yacht`.
- Home and leaderboard are information surfaces and may scroll. Game routes are immersive app surfaces and must not vertically scroll.

## Brand

Hajun Arcade is a compact, premium game room: dark green felt, warm brass, precise mono numerals, and tactile controls. The tone is competitive and physical rather than playful-casino or dashboard-like. Every game should feel ready to play within one glance.

## Product goals

1. Fit the complete core play loop in the currently visible viewport on phone portrait, phone landscape, tablet, and desktop.
2. Keep the 3D playfield visually dominant while making the next valid action obvious and reachable.
3. Preserve accurate carom controls and scoring while reducing configuration-panel friction.
4. Make Yacht dice communicate weight through gravity, wall/floor contact, bounce, angular momentum, and a readable final face.
5. Maintain fast rendering and stable WebGL contexts on mobile devices.
6. Make the home route a direct game launcher: all three games and leaderboard access must be obvious without promotional scrolling.

## Personas and jobs

- **Quick mobile player:** opens a game, understands the state, and completes turns one-handed without page scrolling.
- **Carom player:** evaluates the table, enters the player view, selects spin/aim/power/stroke, and shoots with predictable feedback.
- **Score chaser:** sees remaining Yacht rolls, 15 candidate category scores, upper-section bonus progress, total, and leaderboard-oriented result at all times.

## Information architecture

- **Global app shell:** home and leaderboard only; game routes do not render the global site header or footer.
- **Home:** compact identity row, three primary game choices, then the three live top-five boards. No marketing hero or decorative showcase section.
- **Game HUD:** back action, game identity, and primary score/turn information.
- **Playfield:** the largest region; 3D table or dice tray.
- **Action surface:** direct, persistent controls adjacent to the playfield.
- **Decision surface:** Yacht score categories or billiards shot feedback.
- **Result overlay:** blocks play only after a completed run and exposes replay/ranking actions.

## Design principles

1. **One viewport, one turn.** No game action or score decision may require body scrolling.
2. **Playfield first.** Chrome becomes smaller before the 3D scene does.
3. **Direct manipulation.** Tap the table/die; drag the cue point or stroke. Avoid modal setup drawers.
4. **State over decoration.** Rolls, holds, candidates, power, and score receive stronger contrast than explanatory copy.
5. **Stable geometry.** UI must not jump when state changes, animation completes, or mobile browser bars resize.
6. **Touch-safe density.** Compact controls retain at least a practical 40–44 px primary touch target; dense score cells may be smaller only when arranged as a stable grid with clear spacing.
7. **Launch before selling.** The home page starts with playable choices, not brand claims, oversized slogans, or ornamental motion.
8. **One state, one signal.** Do not repeat the same score, life count, view mode, progress, instruction, or ranking destination in adjacent UI.

## Visual language

- Background: near-black green (`#07120e` / `#10120f`).
- Primary action/state: mint green (`--green`).
- Score/held/emphasis: brass amber (`--amber`).
- Surfaces use one-pixel low-contrast borders and restrained translucent fills.
- Sans type describes; mono type measures scores, rounds, power, and technical state.
- Motion is physical and short. Avoid decorative looping motion. Respect `prefers-reduced-motion`.

## Components

### Immersive AppShell

- Adds a `game-shell` route state.
- Uses the full `100dvh` without the global header/footer, a `min-height: 0` main area, and hidden body overflow only while a game route is active.
- Home and leaderboard retain the global header and normal document flow; the promotional footer is omitted.

### Home game launcher

- A short heading and one explicit `전체 순위` action introduce the page.
- Three equal-priority cards link directly to 3-cushion, four-ball, and Yacht; each contains only game identity, run format, one-line rule summary, and a clear play affordance.
- The three compact leaderboards follow immediately. Do not repeat a separate Hall of Fame sales pitch.
- Decorative orbit rings, floating balls/dice, oversized hero copy, generic installation claims, and a promotional footer are excluded.

### Play HUD

- Fixed-height top row inside each game.
- Back action, title, score, and five-life state align horizontally.
- A compact `순위` / `로컬` status makes cloud-run eligibility visible before the result screen.
- Do not repeat the game title in an eyebrow or repeat the five-life state as both hearts and a numeric counter.

### Billiards stage and shot rail

- Table consumes all area below the HUD.
- Shot rail stays directly on the right edge, always visible, with 0–45° cue elevation, stroke, and pull-release controls.
- The cue power strip uses a fixed 0–100 travel independent of initial touch position: drag downward and release, with every displayed power from 1 accepted. The engine maps that intent progressively to cue-ball speed so the lower third remains a precision range and maximum pull never saturates early.
- Short landscape screens switch the three delivery presets into one compact row and widen the right rail, preserving a practical vertical power drag instead of compressing it into a few pixels.
- `밀기`, `기본`, and `끊기` are honest delivery presets: they move the physical strike point to upper, centre, and lower ball while changing the cue animation finish. At equal displayed power and equal strike point, labels never add hidden speed, spin, or squirt multipliers.
- Cue elevation includes a compact physical side preview: the rendered cue rises around the ball as the 0–45° value changes. Its native range input must be explicitly constrained to the rail width on mobile.
- Every new or restarted billiards run begins with a level 0° cue; elevated shots are always an explicit player choice.
- The strike point is a 3D reticle clamped to the physical cue-ball surface; dragging it moves the rendered cue tip and the impact vector together.
- The launch guide follows the predicted initial ball vector, including the small immediate squirt from side tip offset.
- Table annotations avoid the rail safe zone.
- The rail is the sole view-mode indicator and control. Technical table dimensions and a second view badge do not overlay the playfield.

### Yacht dice tray

- Dice are the primary interactive objects.
- Roll state and round state overlay the tray without consuming a separate row.
- Held dice use amber material/state and remain still during subsequent rolls.
- Unheld dice enter the tray as a shared throw, then respond to gravity, floor/rail restitution, friction, angular momentum, and die-to-die impulses before a damped face settle. They must not teleport directly into a straight display row.
- The visible raised tray rails match the simulated collision bounds. Rounded dice, inset dark pips, contact shadows, and restrained warm/cool lighting provide depth without exceeding the mobile WebGL budget.

### Yacht action dock

- Five compact hold toggles and one high-contrast roll action remain adjacent to the tray.
- The roll button exposes the remaining-roll state without changing its footprint.
- The tray roll indicators and action label are sufficient; do not add a repeated tutorial sentence beneath the controls.

### Yacht scorecard

- Uses 15 score categories: Ones–Sixes, Choice, One Pair, Two Pairs, Three/Four of a Kind, Small/Large Straight, Full House, and Yacht.
- The six upper categories award an automatic 35-point bonus at a subtotal of 63; the non-interactive bonus row stays directly between the upper and lower sections.
- Desktop: one compact 16-row column next to the tray, including the bonus status row.
- Portrait/landscape mobile: 2-column × 8-row decision grid to keep every category and the bonus visible.
- Candidate, locked, maximum, and disabled states must remain distinguishable without relying on hover.
- Total score appears once in the HUD. The scorecard does not repeat total or round progress.

### Result dialog

- Shows one final score, one plain completion sentence, save state, replay, and full-ranking action.
- Does not embed another leaderboard, repeat the score in a second card, add decorative completion slogans, or use game-unrelated metaphors.

## Accessibility

- Interactive elements use semantic buttons/links and visible focus states.
- Icon-only compact states retain Korean `aria-label` text.
- Score category buttons announce label, rule, and current/candidate score.
- Color is paired with text, shape, or position for held/used/locked state.
- Reduced-motion users receive immediate or strongly damped dice settling.

## Responsive behavior

### Desktop (`> 860px`)

- No global game navigation; the play surface starts at the viewport top.
- Play HUD: approximately 68–72 px.
- Billiards: full-width stage with a 112–126 px right rail overlay.
- Yacht: playfield/scorecard split around 60/40, with both regions constrained to remaining viewport height.

### Mobile portrait (`<= 860px`)

- No global game navigation; a compact icon-only back action stays in the play HUD.
- Home uses a normal top app bar, a dense single-column game list that exposes all three choices in the initial portrait viewport, and a single-column leaderboard list. It must not add a fixed bottom navigation bar.
- Play HUD: approximately 64–68 px.
- Billiards remains stage-first with the narrow direct rail.
- The billiards rail reserves its own viewport width and right safe-area inset; neither the angle slider nor any rail child may cross the screen edge.
- Yacht stacks dice/action above the score decision grid; both must fit within the remaining dynamic viewport.

### Short mobile landscape (`height <= 620px`)

- No global game navigation.
- Play HUD: approximately 42–48 px; secondary copy hides.
- Yacht becomes a left/right split: tray/actions on the left and the 2-column score grid on the right.
- Safe-area insets are applied without introducing document scroll.

## Interaction states

- **Idle:** primary action enabled; unavailable choices visibly muted.
- **Rolling/moving:** conflicting controls disabled; scene continues rendering without layout shift.
- **Held:** amber die plus textual `고정됨` state.
- **Candidate:** mint score; maximum candidate receives a filled badge.
- **Locked:** recorded score uses amber and cannot be changed.
- **Loading/error/WebGL fallback:** stays inside the playfield bounds; never expands the page.
- **Finished:** centered result overlay with replay and ranking actions.

## Content voice

- Short, active Korean labels. Keep English only for established game terms such as Yacht category names.
- Put rules in labels and accessible descriptions rather than persistent paragraphs during play.
- Prefer `굴리기`, `홀드`, `점수 선택`, `조준`, `스트로크` over tutorial prose.

## Constraints

- React 19, React Three Fiber, Three.js, and existing dependencies only.
- No Playwright in implementation or verification.
- Mobile WebGL stability takes priority over high shadow resolution or ornamental effects.
- Yacht scoring uses 15 Yatzy-style categories with strict 1–5 / 2–6 straights, plus the requested 63-point threshold and 35-point upper bonus; maximum score is 359.
- Dice results are chosen by game state; the 3D simulation physically communicates the throw and settles to that result.

## Open questions and current decisions

- **Decision:** only game routes are viewport-locked; home and leaderboard remain scrollable.
- **Decision:** game routes omit the global site header/footer and retain navigation through the in-game back action.
- **Decision:** billiards runs start with five lives; scoring preserves lives and only a miss consumes one.
- **Decision:** 3-cushion uses UMB Scheme A and Korean four-ball uses the near-red opening layout; the first shot must directly attack the far red.
- **Decision:** ranked submissions use a hidden anonymous-auth identity and server-timed one-use run; local play remains available when ranked setup fails.
- **Decision:** billiards cue impact derives angular velocity from the 3D contact arm crossed with cue impulse; elevated side hits create progressive cloth-driven swerve instead of a single scripted curve.
- **Decision:** cue elevation is table-bound from 0–45°; it supports squirt/swerve/massé behavior without enabling an airborne jump-ball state.
- **Decision:** no new rigid-body dependency. Yacht uses a bounded lightweight impulse simulation for five dice.
- **Decision:** dense mobile score hints are visually condensed, while full rule text remains in accessible labels.
- **Decision:** browser verification uses Chrome DevTools Protocol, not Playwright.
- **Decision:** home is a functional launcher, not a marketing landing page; game choices precede leaderboard previews and there is no decorative hero/footer.
