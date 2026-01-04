// Convert large JSON files to Parquet for better performance
// Run with: node scripts/convert-to-parquet.js

const { Database } = require('duckdb-async');
const path = require('path');

async function convertToParquet() {
  console.log('Starting conversion to Parquet format...');
  console.log('This will significantly improve loading times for large datasets.');
  
  const db = await Database.create(':memory:');
  
  try {
    // Set memory limit
    await db.exec(`SET memory_limit='2GB'`);
    
    console.log('\nReading all message JSON files...');
    const outputPath = path.join(process.cwd(), 'Messages', 'all_messages.parquet');
    
    await db.exec(`
      COPY (
        SELECT 
          ID,
          Timestamp,
          Contents,
          Attachments
        FROM read_json_auto('./Messages/c*/messages.json', 
          maximum_object_size=200000000,
          ignore_errors=true,
          sample_size=50000,
          union_by_name=true
        )
      ) TO '${outputPath.replace(/\\/g, '/')}' (FORMAT PARQUET, COMPRESSION ZSTD);
    `);
    
    console.log('\n✓ Conversion complete!');
    console.log(`Output: ${outputPath}`);
    console.log('\nTo use the Parquet file, update lib/db.ts:');
    console.log("  The code will automatically use 'all_messages.parquet' if it exists");
    
    // Get file size
    const fs = require('fs');
    if (fs.existsSync(outputPath)) {
      const parquetSize = fs.statSync(outputPath).size / (1024 * 1024);
      console.log(`\nParquet file size: ${parquetSize.toFixed(2)} MB`);
    }
    
  } catch (error) {
    console.error('\n✗ Error during conversion:', error.message);
    process.exit(1);
  } finally {
    await db.close();
  }
}

convertToParquet();
