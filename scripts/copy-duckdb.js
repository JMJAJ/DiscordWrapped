// Copies the DuckDB-WASM runtime into public/duckdb so the app serves it itself.
// The .wasm files are ~35 MB, which is too large for jsDelivr to serve reliably.
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'node_modules', '@duckdb', 'duckdb-wasm', 'dist')
const dest = path.join(__dirname, '..', 'public', 'duckdb')
const files = [
  'duckdb-mvp.wasm',
  'duckdb-eh.wasm',
  'duckdb-browser-mvp.worker.js',
  'duckdb-browser-eh.worker.js',
]

fs.mkdirSync(dest, { recursive: true })
for (const file of files) {
  const from = path.join(src, file)
  const to = path.join(dest, file)
  const a = fs.statSync(from)
  const b = fs.existsSync(to) ? fs.statSync(to) : null
  if (!b || b.size !== a.size || b.mtimeMs < a.mtimeMs) fs.copyFileSync(from, to)
}
console.log(`DuckDB-WASM files ready in public/duckdb`)
