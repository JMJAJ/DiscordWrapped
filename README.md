# Discord Wrapped

A Spotify‑inspired, fully client-side recap of your Discord activity. Upload the ZIP that Discord emails you, choose what to import, pick a year (or All Time) and relive it through an animated slide deck. Everything is computed in your browser.

## ✨ Highlight Reel

- **100% client-side** – DuckDB WASM runs in a Web Worker; your ZIP never leaves your device.
- **Choose what to import** – a two-second scan shows what your export contains, then you decide which parts go into the Wrapped.
- **Any year, instantly** – the archive is parsed once; switching years only re-runs the queries.
- **60-odd slides in 11 chapters** – from message counts to voice hours, lurking habits, friends and an end-of-year archetype.
- **Your local time** – hours, days and streaks use your own time zone, not UTC.
- **Real names** – servers, channels and DMs are named from the export itself (DM partners from your friends list).
- **Share as image** – the recap draws a 1080 × 1350 summary card you can save or copy.
- **Large exports welcome** – multi-GB activity logs are streamed, never loaded whole.

## 🧭 The Flow

1. **Upload** the untouched ZIP.
2. **Choose** what to import:

   | Source | Always? | What it adds |
   | --- | --- | --- |
   | Messages | Yes | Everything you typed: totals, rhythm, places, style, emojis |
   | Voice and activity | Optional | Voice, time in Discord, lurking, social life, reactions, edits, commands, odds and ends |
   | Games | Optional | Play time per game (all-time totals) |
   | Purchases, Orbs and Quests | Optional, **off by default** | Money spent, purchases, Orbs, Quests: these put amounts on screen |

3. **Pick a year** or All Time. You can come back and change the year or the sources without uploading again.
4. **Browse the slides** with the chapter rail, the arrow keys, or the "All slides" index.

## 📈 What's Inside, Chapter by Chapter

- **Messages** – messages, words, active days, longest streak, change versus the previous year; messages per year for All Time.
- **Rhythm** – peak hour and day, hour / weekday / month charts, a day-by-day calendar heatmap, night owl or early bird, weekend share, your wildest day and month, rapid-fire bursts.
- **Habits** – hours with Discord open, per day and per device; the **lurker index** (the share of channel opens that went to channels you never wrote in); the channels you lurk in most.
- **Places** – top channels, servers and DMs, DMs versus servers, the servers you check most, servers joined and left.
- **Social** – friends added, requests sent and received, invites accepted; friends, blocked users and linked accounts right now; servers where you are admin and servers you created; your own apps and bots.
- **Style** – conversation starters, hype, ALL CAPS, questions, links and favorite sites, files and GIFs, mentions and who you ping most, vocabulary (English and Spanish stop words), sentiment, longest message, edits and deletions.
- **Emojis** – custom emotes, standard emojis, emoji-only messages, favorite reactions.
- **Voice** – voice hours, voice hangouts, streams watched and shared.
- **Extras** – slash commands, phone app opens, Nitro and purchases, Orbs, Quests, most played games, odds and ends (captchas, voice messages, voice effects), and your avatar history.
- **Recap** – your **archetype** (for example "Night-Owl Voice Dweller", with the numbers behind it), the summary card with **Share as image**, and the outro.

## 🗂️ Where Each Number Comes From

| Export file | Used for |
| --- | --- |
| `Messages/*/messages.json`, `channel.json`, `index.json` | All message stats, channel and DM names |
| `Servers/index.json`, `Servers/*/channels.json` | Server and channel names |
| `Account/user.json` | Friends and blocked users, linked accounts, DM names, play time per game, Orb balance |
| `Account/applications/*/application.json` | Your apps and bots |
| `Account/recent_avatars/*` | Avatar history (dates come from the avatar ids) |
| `Activity/*/events-*.json` | Voice, streams, reactions, edits, commands, app opens, sessions, channel and server views, relationships, invites, servers created, captchas, voice messages and effects |
| `Account/user_data_exports/discord_billing`, `discord_virtual_currency` | Payments and Orbs |
| `Ads/quests_user_status.json` | Quests |

A few things to know about the numbers:

- **Time in Discord** pairs each `session_start` with its `session_end`. A desktop app sitting in the tray counts as open, so one session is capped at 24 hours; read it as "hours with Discord open", not active use.
- **Voice** uses the longest of `voice_disconnect` / `leave_voice_channel` per connection. Recent exports log fewer voice events, so voice hours can come out low for recent years.
- **Games** are all-time totals: the export has one total per game, not per year.
- **Payments**: the export's own legend for the status column does not match real data, so the status used by most rows is treated as paid.
- **Channels you never wrote in** are not named in the export; they appear as "Server • unnamed channel".

## 🚀 Getting Started

### 1. Request your Discord archive

1. Open **Discord → Settings → Privacy & Safety**
2. Scroll to **Request all of my Data** and include Account, Activity, Messages and Servers
3. Wait for the email (can take up to two weeks)
4. Download the provided ZIP (do **not** unzip)

### 2. Run the app locally

```bash
git clone https://github.com/JMJAJ/DiscordWrapped.git
cd DiscordWrapped
pnpm install      # or npm install; also copies the DuckDB-WASM files into public/duckdb
pnpm dev          # starts Next.js on http://localhost:3000
```

Open the site, drop the Discord ZIP into the uploader, choose what to import and pick a year.

### Optional: export your messages to Parquet

If you want your messages as one Parquet file to explore with DuckDB, pandas or Polars, unzip the export so that `Messages/c<channel id>/messages.json` sits in the folder you run from, then:

```bash
pnpm run convert:parquet
```

It writes `Messages/all_messages.parquet` with `ID`, `Timestamp`, `Contents`, `Attachments` and `ChannelId`, using the official [`@duckdb/node-api`](https://www.npmjs.com/package/@duckdb/node-api) client (a dev dependency). The web app does **not** need or read this file.

## 🌐 Deploying (Vercel example)

1. Make sure your repo is clean (Discord archives are gitignored):
   ```bash
   git status
   ```
2. Push to GitHub.
3. Import the repo in [Vercel](https://vercel.com) and deploy.

The live app ships without data; every visitor uploads their own ZIP and processes it locally. DuckDB-WASM is served from the app itself (`public/duckdb`, filled by `scripts/copy-duckdb.js` on install, dev and build).

## 🧱 Project Structure

```
├── app/
│   ├── layout.tsx               # Root layout, fonts and metadata
│   └── page.tsx                 # Upload → choose sources → pick year → slides
├── components/
│   ├── upload-screen.tsx        # ZIP uploader and quick scan
│   ├── source-selector.tsx      # "What do you want to see?" import picker
│   ├── year-selector.tsx        # Year / All Time picker
│   ├── wrapped-slides.tsx       # Slide deck, chapter navigation, charts
│   ├── share-card-dialog.tsx    # Share as image dialog
│   └── kawarp-background.tsx    # Animated slide backgrounds
├── lib/
│   ├── client-db.ts             # Long-lived worker client (scan / process)
│   ├── worker.ts                # ZIP reading, activity-log streaming, DuckDB stats
│   ├── archetype.ts             # Archetype from the stats
│   ├── share-card.ts            # Canvas drawing of the share card
│   └── utils.ts                 # UI helpers
├── scripts/
│   ├── copy-duckdb.js           # Copies DuckDB-WASM into public/duckdb
│   └── convert-to-parquet.js    # Optional: messages to one Parquet file
└── public/, styles/, etc.
```

## 🧠 Tech Stack

- **Next.js 16** + React 19
- **DuckDB WASM** (self-hosted) for in-browser analytics
- **JSZip** + the browser's native `DecompressionStream` to stream multi-GB logs
- **Framer Motion** for slide animations, **Kawarp** for animated backgrounds
- **Tailwind CSS** + shadcn/ui components
- **TypeScript** end-to-end

## 🔒 Privacy Promise

- The ZIP never leaves the browser – no backend, no uploads, no storage.
- Money slides are opt-in, so amounts do not show up by surprise on a shared screen.
- The share card contains only the numbers shown in its preview, never DM or channel names, and can leave your top server off.
- Git ignores `Messages/`, `Account/`, and other archive folders by default.
- Safe to deploy publicly; every visitor processes their own data locally.

## 🛠️ Customization Hooks

- **Slides:** add or tweak slides in `components/wrapped-slides.tsx` (`createSlides`), and give each new slide id a chapter in `CHAPTER_OF`.
- **Stats:** message stats live in `runStatsQueries`, activity-log stats in `runActivityQueries` (`lib/worker.ts`). To read a new activity event, add it to `ACTIVITY_TYPES` and to the `switch` in `ingestActivity`.
- **Archetype:** habitats, habits and thresholds are in `lib/archetype.ts`.
- **Styling:** edit Tailwind tokens in `styles/globals.css` or swap fonts via `app/layout.tsx`.

## 🐞 Troubleshooting

| Issue | Fix |
| --- | --- |
| Upload rejected | The file must be the untouched ZIP from Discord. |
| "No messages found for year …" | That year may be absent in the archive; pick another from the list. |
| Slow processing | Large exports are processed entirely in the browser; keep the tab open. Leaving out "Voice and activity" skips the biggest files. |
| Voice, habits or social slides missing | The export has no `Activity/` folder, or "Voice and activity" was unticked. |
| "Loading the database engine timed out" | `public/duckdb` is missing: run `npm install` (or `node scripts/copy-duckdb.js`) and reload. |
| Hydration warning about layout | Make sure you are running the latest code (layout sets stable font classes). |

## 🔄 Dependency Updates

[Dependabot](.github/dependabot.yml) opens one grouped pull request every Monday with the minor and patch updates, and a separate pull request for each major update so it can be reviewed on its own. Security fixes arrive as soon as an advisory is published, once **Dependabot security updates** is turned on in the repository's *Settings → Code security*. Run `npm audit` locally to see what is open.

## 🤝 Contributing

Ideas welcome! Some impactful areas:

1. Localization (Spanish first: the vocabulary slide already handles it)
2. Accessibility and phone-sized layouts for every slide
3. Comparing two years side by side
4. Performance for very large archives

Fork, branch, and open a PR – just keep personal Discord data out of the repo.

## ⚖️ License & Disclaimer

Released under the MIT License. This project is unofficial and not affiliated with Discord Inc. Use responsibly and respect Discord's Terms of Service.
