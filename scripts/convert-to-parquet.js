// Optional: convert your exported messages into one Parquet file for your own analysis
// (DuckDB, pandas, Polars, ...). The web app does not need or read this file.
//
// Unzip your Discord export so that ./Messages/c<channel id>/messages.json exists,
// then run: npm run convert:parquet

const { DuckDBInstance } = require('@duckdb/node-api')
const fs = require('fs')
const path = require('path')

const sqlPath = (p) => p.replace(/\\/g, '/').replace(/'/g, "''")

async function convertToParquet() {
  const messagesDir = path.join(process.cwd(), 'Messages')
  if (!fs.existsSync(messagesDir)) {
    console.error(`No Messages folder in ${process.cwd()}. Unzip your Discord export here first.`)
    process.exit(1)
  }

  const outputPath = path.join(messagesDir, 'all_messages.parquet')
  console.log('Reading every Messages/c*/messages.json ...')

  const instance = await DuckDBInstance.create(':memory:')
  const connection = await instance.connect()

  try {
    // Order across files does not matter here, and keeping it costs a lot of memory
    await connection.run(`SET preserve_insertion_order = false`)
    // filename=true adds the source path, so each row keeps its channel id
    await connection.run(`
      COPY (
        SELECT
          ID,
          Timestamp,
          Contents,
          Attachments,
          regexp_extract(filename, '[/\\\\]c([0-9]+)[/\\\\]messages\\.json$', 1) AS ChannelId
        FROM read_json_auto('${sqlPath(path.join(messagesDir, 'c*', 'messages.json'))}',
          -- each file is one JSON array: read it element by element, not as one huge object
          format = 'array',
          ignore_errors = true,
          sample_size = 50000,
          union_by_name = true,
          filename = true
        )
      ) TO '${sqlPath(outputPath)}' (FORMAT PARQUET, COMPRESSION ZSTD);
    `)

    const reader = await connection.runAndReadAll(`SELECT COUNT(*) AS n FROM read_parquet('${sqlPath(outputPath)}')`)
    const rows = Number(reader.getRowObjects()[0].n)
    const sizeMb = fs.statSync(outputPath).size / (1024 * 1024)

    console.log(`\nDone: ${outputPath}`)
    console.log(`  ${rows.toLocaleString('en-US')} messages, ${sizeMb.toFixed(2)} MB`)
  } catch (error) {
    console.error('\nConversion failed:', error.message)
    process.exitCode = 1
  } finally {
    connection.closeSync()
    instance.closeSync()
  }
}

convertToParquet()
