// Process Discord data export into a single Parquet file
// Run with: node scripts/process-discord-data.js

const { Database } = require('duckdb-async');
const fs = require('fs');
const path = require('path');

async function processDiscordData() {
  console.log('Processing Discord data export...\n');
  
  const messagesDir = path.join(process.cwd(), 'Messages');
  const outputPath = path.join(messagesDir, 'all_messages.parquet');
  
  // Find all channel folders
  const channelFolders = fs.readdirSync(messagesDir)
    .filter(f => f.startsWith('c') && fs.statSync(path.join(messagesDir, f)).isDirectory());
  
  console.log(`Found ${channelFolders.length} channel folders`);
  
  // Collect all messages
  let allMessages = [];
  let channelNames = {};
  
  // Load channel index for names
  const indexPath = path.join(messagesDir, 'index.json');
  if (fs.existsSync(indexPath)) {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    channelNames = index;
  }
  
  for (const folder of channelFolders) {
    const messagesPath = path.join(messagesDir, folder, 'messages.json');
    const channelPath = path.join(messagesDir, folder, 'channel.json');
    
    if (!fs.existsSync(messagesPath)) continue;
    
    try {
      const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
      
      // Get channel name
      let channelName = 'Unknown';
      const channelId = folder.substring(1); // Remove 'c' prefix
      
      if (fs.existsSync(channelPath)) {
        const channelInfo = JSON.parse(fs.readFileSync(channelPath, 'utf8'));
        channelName = channelInfo.name || channelNames[channelId] || 'Unknown';
      } else if (channelNames[channelId]) {
        channelName = channelNames[channelId];
      }
      
      // Add channel name to each message
      for (const msg of messages) {
        allMessages.push({
          ...msg,
          ChannelName: channelName
        });
      }
    } catch (err) {
      console.log(`  Skipping ${folder}: ${err.message}`);
    }
  }
  
  console.log(`\nLoaded ${allMessages.length.toLocaleString()} messages total`);
  
  // Write to temp JSON file
  const tempPath = path.join(messagesDir, 'temp_all_messages.json');
  console.log('\nWriting temporary JSON file...');
  fs.writeFileSync(tempPath, JSON.stringify(allMessages));
  
  // Convert to Parquet using DuckDB
  console.log('Converting to Parquet format...');
  const db = await Database.create(':memory:');
  
  await db.exec(`
    COPY (
      SELECT 
        ID,
        Timestamp,
        Contents,
        Attachments,
        ChannelName
      FROM read_json_auto('${tempPath.replace(/\\/g, '/')}')
    ) TO '${outputPath.replace(/\\/g, '/')}' (FORMAT PARQUET, COMPRESSION ZSTD);
  `);
  
  await db.close();
  
  // Clean up temp file
  fs.unlinkSync(tempPath);
  
  // Report results
  const parquetSize = fs.statSync(outputPath).size / (1024 * 1024);
  console.log(`\n✓ Done! Created ${outputPath}`);
  console.log(`  Messages: ${allMessages.length.toLocaleString()}`);
  console.log(`  Parquet size: ${parquetSize.toFixed(2)} MB`);
  console.log('\nThe app will now automatically use this file for faster loading.');
}

processDiscordData().catch(console.error);
