# Home screen redesign mockup (2026-09-16)

Pulled from the Claude Design canvas artifact **Dragon Stats Home Screen**
(https://claude.ai/artifact/VTsBtL4swp4VZsiN4P4BM8). Each `*.dc.html` is one artboard;
`canvas.json` holds the layout and the annotations. Open any artboard directly in a browser.

## Home Â· Game Day

- **Home Â· phone** — `Main.dc.html` (390×940)
  GAME DAY (Option B) â€” chosen direction
  Program logo + primary_color in the header; opponents render through TeamCrest: their uploaded logo, or initials on their primary_color when there is none (shown here). Opponent names, colors and scores are sample data.
- **Home Â· iPad Pro landscape (768 max-w-tablet)** — `Tablet.dc.html` (768×900)
  iPad Pro landscape
  At lg the app caps the screen at 768px (max-w-tablet). Two columns: the press-box tasks on the left, recent games on the right so a coach can open any report in one tap. Regular iPad / portrait uses the phone layout centered.

## Other directions

- **Current (reference)** — `Current.dc.html` (390×940)
  CURRENT
  What the home screen looks like today, for comparison.
- **A Â· Scoreboard** — `OptionA.dc.html` (390×940)
  A Â· SCOREBOARD â€” bold, broadcast feel
  The record is the hero. Last 5 results as a scoreboard strip, next game as a ticket.
- **C Â· Bento** — `OptionC.dc.html` (390×940)
  C Â· BENTO â€” everything at a glance
  Modular tiles; densest option, scales up well on iPad.
- **D Â· Season Timeline** — `OptionD.dc.html` (390×940)
  D Â· SEASON TIMELINE â€” the schedule is the home
  One scroll tells the season story with a NOW marker on the next game.
- **E Â· Leaders Board** — `OptionE.dc.html` (390×940)
  E Â· LEADERS BOARD â€” coach-facing, stats-forward
  Season leaders with bars, team per-game numbers. (Names and stats are sample data.)
## Theme explorations (2026-09-17)

Same Game Day layout as `Main.dc.html`, re-skinned. Type, color, texture and shape changed; nothing moved.

- **T1 · Gameday Program** — `ThemeProgram.dc.html` — cream paper, ink, one red. Big Shoulders Display + Source Serif 4. Numbered sections and hairline rules instead of cards.
- **T2 · Turf & Chalk** — `ThemeTurf.dc.html` — turf green with yard lines and sideline hash marks, chalk-white borders, first-down yellow. Alumni Sans + Atkinson Hyperlegible.
- **T3 · Broadcast** — `ThemeBroadcast.dc.html` — light studio gray, black scorebug header, red slash, angled corners. Chakra Petch + Manrope.
- **T4 · Varsity** — `ThemeVarsity.dc.html` — navy felt, red/cream stripe, cream record patch, stitched red next-game patch. Graduate + Work Sans.

## Live game · Broadcast (2026-09-17)

The play-entry screen in the chosen theme. Not built yet — mockups only.

- **L1 · iPad landscape · dark** — `LiveIpadDark.dc.html` — scorebug header, situation strip, field with TV-style LOS/first-down lines, entry panel beside the drive log.
- **L2 · iPad landscape · light** — `LiveIpadLight.dc.html` — same board on the studio stage.
- **L3 · phone** — `LivePhone.dc.html` — compact scorebug, stacked situation strip, bottom pane switcher.
