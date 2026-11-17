# Discord Wrapped

A Spotify‑inspired, fully client-side recap of your Discord activity. Upload the ZIP that Discord emails you, let the app crunch the numbers right in your browser, then pick the year you want to relive through an animated slide deck.

## ✨ Highlight Reel

- **Automatic year detection** – upload once, then choose any detected year without reprocessing on the server.
- **20+ rich metrics** – total messages, words, streaks, peak activity windows, hype energy, sentiment cues, and more.
- **Channel + DM insights** – friendly names for servers, channels, and direct messages.
- **Beautiful presentation** – Framer Motion powered slides, Spotify Wrapped vibe, responsive design.
- **100% client-side** – DuckDB WASM runs in-browser; your ZIP never leaves your device.

## 📈 Stats At A Glance

- Total messages, words, characters
- Active days, longest streak, busiest day & hour
- Top channels, words, emojis, links, mentions
- Night owl vs early bird, weekend warrior breakdown
- Sentiment heuristics, conversation starters, hype energy
- Burst sequences, longest message, ghosting days, much more
- Top servers, top DMs (real names from your friends list), DMs vs servers split
- Hour / weekday / month charts and a day-by-day calendar heatmap, in your local time zone
- Standard emojis, files and GIFs sent, most-shared sites, most-pinged people, year-over-year change
- English + Spanish stop words for the vocabulary slide
- From the `Activity/` logs (streamed, never fully loaded): voice hours and top voice hangouts, streams watched, favorite reactions, edits and deletions, slash commands, mobile app opens, servers joined and left
- From `Account/user.json`: most played games (all-time totals; names are recovered from the activity log)
- **Choose what to import** – after the upload a quick scan shows what the ZIP contains and lets you leave out the activity logs, games or money slides (money is off by default)
- **Chapter navigation** – slides are grouped into chapters (Messages, Rhythm, Habits, Places, Social, Style, Emojis, Voice, Extras, Recap) with a progress rail and an "All slides" index
- **Habits** – hours with Discord open per day and per device (paired `session_start` / `session_end`, one session capped at 24 h), and a lurker index: the share of channel opens that went to channels you never wrote in, plus the channels and servers you check most
- **Social** – friends added, requests sent and received, invites accepted, friends and blocked users right now, linked accounts, servers where you are admin, servers created, and your own apps and bots
- **Odds and ends** – captchas, voice messages played, voice effects, deleted messages, and your avatar history with dates read from the avatar ids
- **Archetype** – a final title such as "Night-Owl Voice Dweller", built only from your own numbers, with the reasons shown; it also appears on the share card
- **Share as image** – the recap slide can draw a 1080 × 1350 summary card on a canvas to save or copy, with an option to leave your top server off it
- From the billing, virtual currency and quests exports: money spent per currency, most repeated purchases, Orbs earned and spent, Quests completed

## 🚀 Getting Started

### 1. Request your Discord archive

1. Open **Discord → Settings → Privacy & Safety**
2. Scroll to **Request all of my Data**
3. Wait for the email (can take up to two weeks)
4. Download the provided ZIP (do **not** unzip)

### 2. Run the app locally

```bash
git clone https://github.com/JMJAJ/DiscordWrapped.git
cd discord-wrapped
pnpm install      # or npm install / yarn install
pnpm dev          # starts Next.js on http://localhost:3000
```

Visit the site, drop the Discord ZIP into the uploader, then pick the year you want to see. The worker keeps the file around so you can swap years instantly.

### Optional: pre-convert for advanced workflows

If you want an optimized Parquet copy of your archive (for experimentation or faster repeat loads), unzip the archive, place the `messages` folders under `Messages/`, then run:

```bash
pnpm run convert:parquet
```

This step is **not** required for normal usage.

## 🌐 Deploying (Vercel example)

1. Ensure your repo is clean (Discord archives are gitignored):
   ```bash
   git status
   ```
2. Push to GitHub.
3. Import the repo in [Vercel](https://vercel.com) and deploy.

The live app ships without data; every visitor uploads their own ZIP and processes it locally.

## 🧱 Project Structure

```

├── app/
│   ├── layout.tsx           # Root layout & metadata
│   └── page.tsx             # Upload flow, year selector, slides
├── components/
│   ├── upload-screen.tsx    # ZIP uploader
│   ├── year-selector.tsx    # Post-upload year picker
│   └── wrapped-slides.tsx   # Animated recap deck
├── lib/
│   ├── client-db.ts         # Browser worker bootstrapper
│   ├── worker.ts            # DuckDB WASM processing & stats
│   └── utils.ts             # UI helpers
├── scripts/
│   └── convert-to-parquet.js# Optional offline preprocessing
└── public/, styles/, etc.
```

## 🧠 Tech Stack

- **Next.js 16** + React 19
- **DuckDB WASM** for in-browser analytics
- **Framer Motion** for slide animations
- **Tailwind CSS** + shadcn/ui components
- **TypeScript** end-to-end

## 🔒 Privacy Promise

- The ZIP never leaves the browser – no backend storage.
- Git ignores `Messages/`, `Account/`, and other archive folders by default.
- Safe to deploy publicly; every visitor processes their own data locally.

## 🛠️ Customization Hooks

- **Slides:** tweak or add sections in `components/wrapped-slides.tsx` (`createSlides`).
- **Stats:** extend the queries in `lib/worker.ts` → `runStatsQueries`.
- **Styling:** edit Tailwind tokens in `styles/globals.css` or swap fonts via `app/layout.tsx`.

## 🐞 Troubleshooting

| Issue | Fix |
| --- | --- |
| Upload rejected | The file must be the untouched ZIP from Discord. |
| “No messages found for year …” | That year may be absent in the archive; pick another from the list. |
| Slow processing | Large archives run entirely client-side; keep the tab focused and wait—it can take several minutes for multi-year histories. |
| Hydration warning about layout | Ensure you’re running the latest code (layout now sets stable font classes). |

## 🤝 Contributing

Ideas welcome! Some impactful areas:

1. Export/share flows (PNG, MP4, social summaries)
2. Accessibility & localization improvements
3. Performance optimizations for very large archives

Fork, branch, and open a PR – just keep personal Discord data out of the repo.

## ⚖️ License & Disclaimer

Released under the MIT License. This project is unofficial and not affiliated with Discord Inc. Use responsibly and respect Discord’s Terms of Service.
- All processing happens locally on your machine
