# Deploying Discord Wrapped to Vercel

This guide explains how to deploy Discord Wrapped to Vercel so others can use it **without uploading your personal Discord data**.

## Important: Data Privacy

⚠️ **NEVER commit your Discord data to Git!** The `.gitignore` file is configured to exclude:
- `/Messages/` folder
- `/Account/` folder  
- All Discord export folders
- `.parquet` and `.db` files

## Deployment Options

### Option 1: Demo Mode (Recommended for Public Deployment)

Deploy the app without any data. Users will need to:
1. Download their Discord data package from Discord
2. Upload it directly in the browser
3. Process it client-side

**Steps:**
1. Remove all Discord data folders from your project
2. Push to GitHub (data is already gitignored)
3. Deploy to Vercel from GitHub
4. Users upload their own data when they visit

**Pros:**
- No privacy concerns
- Free tier friendly (no large files)
- Users control their own data

**Cons:**
- Users need to download their Discord data first
- Requires client-side processing (slower)

### Option 2: Personal Deployment (Your Data Only)

Deploy with your pre-processed data for personal use only.

**Steps:**
1. Run `node scripts/process-discord-data.js` locally
2. Keep only the `Messages/all_messages.parquet` file (6-7MB)
3. Delete all other Discord data folders
4. Deploy to Vercel

**Pros:**
- Fast loading (data pre-processed)
- Works immediately

**Cons:**
- Only works for your data
- Not suitable for public sharing
- Still ~7MB to deploy

### Option 3: Client-Side Processing (Future Enhancement)

For a truly public version, you'd need to:
1. Use DuckDB-WASM for browser-based processing
2. Let users upload their Discord data package
3. Process everything in the browser
4. No server-side data storage

This requires significant refactoring but is the best approach for a public tool.

## Vercel Deployment Steps

### 1. Prepare Your Repository

```bash
# Make sure data is gitignored
git status

# Should NOT show any of these:
# - Messages/
# - Account/
# - Activities/
# - *.parquet
# - *.db
```

### 2. Push to GitHub

```bash
git add .
git commit -m "Prepare for Vercel deployment"
git push origin main
```

### 3. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset:** Next.js
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`
5. Click "Deploy"

### 4. Environment Variables (if needed)

No environment variables are required for basic deployment.

## Vercel Free Tier Limits

- **Bandwidth:** 100GB/month
- **Build Time:** 6000 minutes/month
- **Serverless Function Size:** 50MB
- **Deployment Size:** 100MB (compressed)

Your app should easily fit within these limits if you:
- Don't commit Discord data files
- Keep dependencies minimal
- Use the pre-processed Parquet file (if personal deployment)

## File Size Optimization

If deploying with your data:

```bash
# Keep only the processed Parquet file
rm -rf Messages/channel_*
rm -rf Account/
rm -rf Activities/
rm -rf Activity/
rm -rf Ads/
rm -rf Servers/

# Keep only:
# - Messages/all_messages.parquet (~7MB)
```

## Testing Locally Before Deploy

```bash
# Build production version
npm run build

# Test production build
npm start

# Check build size
du -sh .next
```

## Troubleshooting

### "Deployment too large"
- Remove all Discord data folders except `Messages/all_messages.parquet`
- Check `.gitignore` is working: `git ls-files | grep Messages`

### "Build failed"
- Make sure `duckdb-async` is in `dependencies`, not `devDependencies`
- Check that `next.config.mjs` has proper externals configuration

### "Function too large"
- The API route might be too big with DuckDB
- Consider moving to client-side processing with DuckDB-WASM

## Recommended: Add Upload Feature

For a public deployment, add a file upload component so users can upload their own Discord data package. This would require:

1. Client-side ZIP extraction
2. DuckDB-WASM for browser processing
3. IndexedDB for temporary storage

This keeps your deployment clean and respects user privacy.

## Security Notes

- Never commit Discord data to public repositories
- Consider adding authentication if deploying with personal data
- Use environment variables for any sensitive configuration
- Review Vercel's security best practices

## Cost Considerations

**Free Tier is sufficient if:**
- No large data files committed
- Moderate traffic (<100GB bandwidth/month)
- No heavy serverless function usage

**You might need Pro ($20/month) if:**
- High traffic (>100GB bandwidth)
- Need faster builds
- Want team collaboration features

## Alternative: Static Export

For maximum cost savings, export as static HTML:

```bash
# Add to next.config.mjs
output: 'export'

# Build static version
npm run build

# Deploy the 'out' folder to any static host
# (Vercel, Netlify, GitHub Pages, etc.)
```

Note: This requires removing API routes and using client-side processing only.
