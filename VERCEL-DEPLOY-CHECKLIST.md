# Vercel Deployment Checklist ✅

Quick checklist to deploy Discord Wrapped to Vercel without crashing your free tier.

## Before You Deploy

### 1. Check What's Being Committed

```bash
git status
```

**Should NOT see:**
- ❌ `Messages/` folder
- ❌ `Account/` folder
- ❌ `Activities/` folder
- ❌ `*.parquet` files
- ❌ `*.db` files
- ❌ ZIP files

**Should see:**
- ✅ `app/` folder
- ✅ `components/` folder
- ✅ `lib/` folder
- ✅ `scripts/` folder
- ✅ Config files

### 2. Verify .gitignore is Working

```bash
git ls-files | grep -E "(Messages|Account|Activities|parquet|\.db)"
```

**Expected output:** Nothing (empty)

If you see files listed, they're being tracked! Remove them:

```bash
git rm -r --cached Messages/ Account/ Activities/ *.parquet *.db
git commit -m "Remove data files from tracking"
```

### 3. Check Repository Size

```bash
du -sh .git
```

**Should be:** < 50MB

If larger, you might have committed data files previously. Consider:
- Using `git filter-branch` to remove them from history
- Or starting a fresh repo

## Deployment Steps

### Option A: Personal Use Only (With Your Data)

1. Keep only `Messages/all_messages.parquet` (~7MB)
2. Delete all other Discord folders
3. Push to GitHub
4. Deploy to Vercel
5. Set to private (don't share the URL)

**Pros:** Works immediately, fast loading
**Cons:** Only your data, not shareable

### Option B: Public Deployment (No Data)

1. Remove ALL Discord data folders
2. Push to GitHub
3. Deploy to Vercel
4. Users need to upload their own data (requires future enhancement)

**Pros:** No privacy concerns, free tier friendly
**Cons:** Doesn't work yet (needs client-side upload feature)

## Recommended: Option B (Clean Deploy)

```bash
# 1. Remove all data (keep it locally, just don't commit)
# Data is already gitignored, so just don't add it

# 2. Verify clean state
git status

# 3. Push to GitHub
git add .
git commit -m "Initial deployment"
git push origin main

# 4. Deploy on Vercel
# - Go to vercel.com
# - Import from GitHub
# - Click Deploy
```

## After Deployment

### Check Deployment Size

In Vercel dashboard:
- **Build time:** Should be < 2 minutes
- **Deployment size:** Should be < 50MB
- **Function size:** Should be < 10MB

### Test the Deployment

1. Visit your Vercel URL
2. Should see "Loading data..." then error (no data uploaded)
3. This is expected for clean deployment

### Next Steps for Public Use

To make it work for others, you need to add:

1. **File upload component**
   ```tsx
   <input type="file" accept=".zip" onChange={handleUpload} />
   ```

2. **Client-side ZIP extraction**
   ```bash
   npm install jszip
   ```

3. **DuckDB-WASM for browser processing**
   ```bash
   npm install @duckdb/duckdb-wasm
   ```

4. **IndexedDB for temporary storage**
   ```typescript
   // Store processed data in browser
   ```

## Vercel Free Tier Limits

| Resource | Limit | Your Usage |
|----------|-------|------------|
| Bandwidth | 100GB/month | ~1MB per visit |
| Build Time | 6000 min/month | ~2 min per deploy |
| Deployments | Unlimited | As needed |
| Function Size | 50MB | ~10MB |
| Function Duration | 10s | ~2s |

**Estimate:** Can handle ~100,000 visits/month on free tier (if no data files)

## Troubleshooting

### "Error: Deployment size exceeds limit"

```bash
# Check what's being deployed
git ls-files | wc -l  # Should be < 1000 files

# Find large files
git ls-files | xargs du -h | sort -rh | head -20

# Remove large files
git rm --cached <large-file>
```

### "Error: Function size exceeds limit"

The API route with DuckDB might be too large. Solutions:

1. Move to client-side processing (DuckDB-WASM)
2. Use Vercel Pro ($20/month) for larger functions
3. Split into multiple smaller functions

### "Build failed: Cannot find module 'duckdb'"

Check `package.json`:
```json
{
  "dependencies": {
    "duckdb-async": "^1.1.4"  // Should be here, not in devDependencies
  }
}
```

## Cost Optimization Tips

1. **Use CDN caching** - Add cache headers to static assets
2. **Optimize images** - Use Next.js Image component
3. **Lazy load components** - Use dynamic imports
4. **Enable compression** - Vercel does this automatically
5. **Monitor usage** - Check Vercel dashboard regularly

## Security Checklist

- ✅ No Discord data in repository
- ✅ No API keys in code
- ✅ .gitignore configured properly
- ✅ Environment variables for secrets (if any)
- ✅ CORS configured (if needed)
- ✅ Rate limiting (consider adding)

## Final Check

Before clicking "Deploy":

```bash
# 1. Clean build locally
npm run build

# 2. Check build output
ls -lh .next

# 3. Test production build
npm start

# 4. Verify no data files
git ls-files | grep -i discord

# 5. Push and deploy!
git push origin main
```

## Success Criteria

✅ Deployment completes in < 3 minutes
✅ Build size < 50MB
✅ No data files in repository
✅ App loads (even if showing "no data")
✅ No errors in Vercel logs

## Need Help?

- Check [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed guide
- Review Vercel docs: https://vercel.com/docs
- Check Next.js deployment: https://nextjs.org/docs/deployment

---

**Remember:** The goal is to deploy the app code, not your personal Discord data!
