const fs = require('fs');
const path = require('path');
const { query } = require('../database/db');

// Parse CSV string into objects (similar to frontend logic)
function parseCSV(csv, defaultSetQuant = null, defaultSetQual = null) {
  console.log('Parsing CSV data...');
  const lines = csv.trim().split('\n');
  
  if (lines.length === 0) return [];
  
  // Check CSV headers to determine structure
  const headerLine = lines[0].toLowerCase();
  const hasSetQuant = headerLine.includes('set_quant');
  const hasSetQual = headerLine.includes('set_qual');
  
  const headers = ['generated', 'message', 'in', 'roll'];
  if (hasSetQuant) headers.push('set_quant');
  if (hasSetQual) headers.push('set_qual');
  
  const parsed = lines.slice(1).map((line, index) => {
    // Simple CSV parsing - split by comma but handle quoted strings
    const values = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
      const char = line[i];
      
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          // Double quote escape
          current += '"';
          i += 2;
        } else {
          // Toggle quotes
          inQuotes = !inQuotes;
          i++;
        }
      } else if (char === ',' && !inQuotes) {
        // Field separator
        values.push(current.trim());
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
    
    // Add the last field
    values.push(current.trim());
    
    // Ensure we have the right number of values based on headers
    while (values.length < headers.length) {
      values.push('');
    }
    
    const obj = {};
    headers.forEach((h, idx) => {
      let value = values[idx] || '';
      
      // Handle N/A values
      if (value === 'N/A' || value === '') {
        obj[h] = null;
      } else if (h === 'generated' || h === 'in' || h === 'roll' || h === 'set_quant' || h === 'set_qual') {
        // Parse integers
        obj[h] = parseInt(value, 10) || 0;
      } else {
        // String values
        obj[h] = value;
      }
    });
    
    // Add default set values if not present in CSV
    if (!obj.set_quant && defaultSetQuant !== null) {
      obj.set_quant = defaultSetQuant;
    }
    if (!obj.set_qual && defaultSetQual !== null) {
      obj.set_qual = defaultSetQual;
    }
    
    // Filter out entries with empty messages
    if (!obj.message || obj.message.trim() === '') {
      return null;
    }
    
    return obj;
  }).filter(obj => obj !== null);
  
  console.log(`Parsed ${parsed.length} valid messages from CSV`);
  return parsed;
}

async function importCSV(csvFilePath, defaultSetQuant = null, defaultSetQual = null) {
  try {
    console.log(`Reading CSV file: ${csvFilePath}`);
    
    if (!fs.existsSync(csvFilePath)) {
      throw new Error(`CSV file not found: ${csvFilePath}`);
    }
    
    const csvContent = fs.readFileSync(csvFilePath, 'utf8');
    const messages = parseCSV(csvContent, defaultSetQuant, defaultSetQual);
    
    if (messages.length === 0) {
      console.log('No valid messages found in CSV file.');
      return;
    }
    
    console.log(`Importing ${messages.length} messages to database...`);
    
    // Clear existing messages (optional - comment out if you want to keep existing data)
    await query('DELETE FROM messages');
    console.log('Cleared existing messages');
    
    // Insert messages in batch
    const insertQuery = `
      INSERT INTO messages (message, generated, in_role, roll_value, set_quant, set_qual) 
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    
    let imported = 0;
    for (const message of messages) {
      try {
        await query(insertQuery, [
          message.message,
          message.generated,
          message.in,
          message.roll,
          message.set_quant,
          message.set_qual
        ]);
        imported++;
      } catch (error) {
        console.error(`Error importing message: "${message.message}"`, error.message);
      }
    }
    
    console.log(`Successfully imported ${imported} messages to the database!`);
    
    // Show summary statistics
    const stats = await query(`
      SELECT 
        generated,
        COUNT(*) as count
      FROM messages 
      WHERE is_active = TRUE 
      GROUP BY generated 
      ORDER BY generated
    `);
    
    console.log('\nImport Summary:');
    stats.rows.forEach(row => {
      const type = row.generated === 0 ? 'Human-written' : 'AI-generated';
      console.log(`  ${type}: ${row.count} messages`);
    });
    
  } catch (error) {
    console.error('Error importing CSV:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const csvFilePath = process.argv[2];
  const setQuant = process.argv[3] ? parseInt(process.argv[3]) : null; // Optional set_quant parameter
  const setQual = process.argv[4] ? parseInt(process.argv[4]) : null; // Optional set_qual parameter
  
  if (!csvFilePath) {
    console.error('Usage: node scripts/import-csv.js <path-to-csv-file> [set-quant] [set-qual]');
    console.error('Example: node scripts/import-csv.js ../data/merged_dataset.csv');
    console.error('Example: node scripts/import-csv.js ../data/merged_dataset.csv 1 2');
    console.error('If set values are not provided and not in CSV, they will be null.');
    process.exit(1);
  }
  
  // Resolve relative path
  const resolvedPath = path.resolve(csvFilePath);
  
  importCSV(resolvedPath, setQuant, setQual)
    .then(() => {
      console.log('CSV import completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('CSV import failed:', error);
      process.exit(1);
    });
}

module.exports = { importCSV };
