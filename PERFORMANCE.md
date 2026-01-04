# Performance Optimization Guide

## Handling Large Discord Data (2GB+)

This app is optimized to handle large Discord data exports using DuckDB, which is designed for analytical queries on large datasets.

### Current Architecture

- **DuckDB**: In-memory analytical database that can handle multi-GB JSON files efficiently
- **Server-side processing**: All data processing happens in API routes, not in the browser
- **Streaming**: DuckDB reads JSON files in chunks, not all at once

### Performance Tips

1. **Memory**: Ensure your system has at least 4-8GB of RAM available
2. **First load**: Initial data processing may take 30-60 seconds for 2GB+ datasets
3. **Subsequent loads**: Data is cached in memory during the session

### If You're Still Having Issues

#### Option 1: Pre-process Data (Recommended for 5GB+)
Convert your JSON to Parquet format for 10x faster loading:

```bash
# Install DuckDB CLI
# Then run:
duckdb -c "COPY (SELECT * FROM read_json_auto('Messages/index.json')) TO 'Messages/data.parquet' (FORMAT PARQUET)"
```

Then update `lib/db.ts` to read from `data.parquet` instead.

#### Option 2: Use Persistent Database
Instead of `:memory:`, use a file-based database:

```typescript
// In lib/db.ts
db = await Database.create("./discord.db")
```

This will be slower on first load but subsequent loads will be instant.

#### Option 3: Filter Data
If you only need recent data, filter during load:

```sql
SELECT * FROM read_json_auto('./Messages/index.json') 
WHERE Timestamp > '2024-01-01'
```

### Build Issues

If you get Turbopack errors with native modules:

```bash
# Use webpack instead of turbopack
npm run dev -- --no-turbo

# Or for production build
npm run build
```

### Alternative: SQLite + Better-SQLite3

For even better performance with large datasets, consider switching to SQLite:

```bash
npm install better-sqlite3 @types/better-sqlite3
```

SQLite is faster for large datasets and has better Windows support.
