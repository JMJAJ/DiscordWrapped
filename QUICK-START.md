# Quick Start Guide

## Fixed Issues

✓ **Build Error**: Fixed Turbopack issue with native DuckDB modules
✓ **Performance**: Optimized for 2GB+ Discord data files

## Running the App

### Option 1: With Turbopack (Faster, but may have issues)
```bash
npm run dev:turbo
```

### Option 2: Without Turbopack (More stable)
```bash
npm run dev
```

Then open http://localhost:3000

## First Time Setup

1. Place your Discord data in the `Messages/` folder
2. Make sure `Messages/index.json` exists
3. Run the app - first load will take 30-60 seconds for large datasets

## Performance Optimization (Optional)

For datasets over 2GB, convert to Parquet format for 5-10x faster loading:

```bash
npm run convert:parquet
```

Then update `lib/db.ts` line 24:
```typescript
// Change this:
SELECT * FROM read_json_auto('./Messages/index.json', 

// To this:
SELECT * FROM read_parquet('./Messages/data.parquet')
```

## Troubleshooting

### "Unknown module type" error
- Run with `npm run dev` (without Turbopack)
- Or run `npm run build` for production build

### Slow loading
- First load is always slow for large datasets (this is normal)
- Consider converting to Parquet format (see above)
- Reduce memory_limit in `lib/db.ts` if you have less than 4GB RAM

### Out of memory
- Reduce `memory_limit` in `lib/db.ts` from '4GB' to '2GB'
- Or use persistent database instead of `:memory:`

## Architecture

- **Frontend**: Next.js 16 + React 19
- **Database**: DuckDB (analytical database for large datasets)
- **Data Processing**: Server-side API routes
- **UI**: Tailwind CSS + Framer Motion

DuckDB is specifically designed for analytical queries on large datasets and can handle multi-GB JSON files efficiently without loading everything into memory at once.
