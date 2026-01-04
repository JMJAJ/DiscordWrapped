# Discord Wrapped 2025

A Spotify Wrapped-style visualization for your Discord activity! See your messaging stats, favorite channels, top emojis, and more in a beautiful, animated presentation.

## 🎉 Features

- **20+ Statistics**: Messages sent, words typed, days active, longest streak, and more
- **Beautiful Animations**: Smooth transitions and dynamic visualizations
- **Spotify-Style Design**: Familiar wrapped experience with Discord theming
- **Yearly Wrapped**: Filtered to show only 2025 activity
- **Summary Card**: All your key stats in one final recap

## 📊 Stats Included

- Total messages & words
- Days active & longest streak
- Peak activity hour & busiest day
- Top channels, emojis, and words
- Night owl vs early bird analysis
- Sentiment analysis (positive vibes %)
- Conversation starters, hype energy, and more!

## 🚀 Quick Start

### For Personal Use

1. **Get Your Discord Data**
   - Go to Discord Settings → Privacy & Safety
   - Click "Request Data"
   - Wait for Discord to email you (takes 24-48 hours)
   - Download the ZIP file

2. **Clone & Install**
   ```bash
   git clone <your-repo>
   cd discord-wrapped
   npm install
   ```

3. **Extract Your Data**
   - Unzip your Discord data package
   - Copy the `messages` folder to the project root (rename to `Messages`)

4. **Process Your Data**
   ```bash
   npm run convert:parquet
   ```

5. **Run the App**
   ```bash
   npm run dev
   ```

6. **View Your Wrapped**
   - Open http://localhost:3000
   - Use arrow keys or click to navigate slides

## 🌐 Deploying to Vercel (For Others to Use)

**Important:** Don't commit your Discord data! Here's how to deploy safely:

### Quick Deploy Steps

1. **Clean Your Repo**
   ```bash
   # The .gitignore already excludes data folders
   git status  # Should NOT show Messages/, Account/, etc.
   ```

2. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Deploy Discord Wrapped"
   git push origin main
   ```

3. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repo
   - Click Deploy
   - Done! ✨

### What Gets Deployed

- ✅ App code (~10MB)
- ✅ Dependencies
- ❌ Your Discord data (gitignored)
- ❌ Parquet files (gitignored)

### For Public Use

The deployed app will be empty (no data). To make it work for others, you'd need to add:

1. **File upload feature** - Let users upload their Discord data ZIP
2. **Client-side processing** - Use DuckDB-WASM to process in browser
3. **No server storage** - Everything stays on user's device

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

## 🛠️ Tech Stack

- **Next.js 16** - React framework
- **DuckDB** - Fast SQL analytics on Parquet files
- **Framer Motion** - Smooth animations
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety

## 📁 Project Structure

```
discord-wrapped/
├── app/                    # Next.js app directory
│   ├── api/wrapped/       # API route for stats
│   └── page.tsx           # Main page
├── components/            # React components
│   └── wrapped-slides.tsx # Slide presentation
├── lib/                   # Utilities
│   └── db.ts             # DuckDB queries
├── scripts/              # Data processing
│   └── process-discord-data.js
└── Messages/             # Your Discord data (gitignored)
    └── all_messages.parquet
```

## 🔒 Privacy

- All processing happens locally on your machine
- No data is sent to external servers
- Your Discord data is gitignored by default
- Safe to deploy without exposing personal information

## 🎨 Customization

### Change the Year Filter

Edit `lib/db.ts`:
```typescript
WHERE Timestamp >= '2025-01-01' AND Timestamp < '2026-01-01'
```

### Modify Stats

Add new stats in `lib/db.ts` → `getWrappedStats()`

### Customize Slides

Edit `components/wrapped-slides.tsx` → `createSlides()`

## 🐛 Troubleshooting

### "No data found"
- Make sure you ran `npm run convert:parquet`
- Check that `Messages/all_messages.parquet` exists

### "Module not found: duckdb"
- Run `npm install`
- Check `next.config.mjs` has proper externals

### "Build failed on Vercel"
- Remove all Discord data folders before deploying
- Check `.gitignore` is working: `git ls-files | grep Messages`

### "Deployment too large"
- Your data files might be committed
- Run: `git rm -r --cached Messages/ Account/ Activities/`
- Commit and push again

## 📝 License

MIT License - feel free to use and modify!

## 🙏 Credits

Inspired by Spotify Wrapped and built with love for the Discord community.

## 🤝 Contributing

Contributions welcome! Some ideas:
- Client-side file upload and processing
- More statistics and visualizations
- Export as image/video
- Multi-year comparison
- Server-specific wrapped

## ⚠️ Disclaimer

This is an unofficial tool and is not affiliated with Discord Inc. Use at your own risk. Always respect Discord's Terms of Service and API usage guidelines.
