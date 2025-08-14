const { query } = require('../database/db');
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
  try {
    console.log('🚀 Initializing database schema for production...');
    
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split schema into individual commands, handling semicolons in functions
    const commands = [];
    let currentCommand = '';
    let inFunction = false;
    let dollarQuoteCount = 0;
    
    const lines = schema.split('\n');
    
    for (const line of lines) {
      currentCommand += line + '\n';
      
      // Track if we're inside a function (between $$ markers)
      const dollarMatches = line.match(/\$\$/g);
      if (dollarMatches) {
        dollarQuoteCount += dollarMatches.length;
        inFunction = (dollarQuoteCount % 2) !== 0;
      }
      
      // If we hit a semicolon and we're not inside a function, end the command
      if (line.trim().endsWith(';') && !inFunction) {
        commands.push(currentCommand.trim());
        currentCommand = '';
      }
    }
    
    // Add any remaining command
    if (currentCommand.trim()) {
      commands.push(currentCommand.trim());
    }
    
    let successCount = 0;
    let skipCount = 0;
    
    for (const command of commands) {
      if (command.trim()) {
        try {
          await query(command);
          successCount++;
          console.log(`✅ Command executed successfully`);
        } catch (error) {
          // Ignore errors for existing objects
          if (error.message.includes('already exists') || 
              error.message.includes('relation') && error.message.includes('already exists')) {
            skipCount++;
            console.log(`⏭️  Skipped existing object`);
          } else {
            console.error('❌ Schema error:', error.message);
            console.error('Command:', command.substring(0, 100) + '...');
            throw error;
          }
        }
      }
    }
    
    console.log(`🎉 Database initialized successfully!`);
    console.log(`📊 Summary: ${successCount} executed, ${skipCount} skipped`);
    
    // Test the connection and functions
    console.log('🧪 Testing database functions...');
    
    try {
      const testResult = await query('SELECT assign_set_quant(), assign_set_qual()');
      console.log('✅ Assignment functions working:', testResult.rows[0]);
    } catch (error) {
      console.log('ℹ️  Assignment functions not ready (expected on first run)');
    }
    
    console.log('🚀 Database setup complete - ready for production!');
    
  } catch (error) {
    console.error('💥 Failed to initialize database:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Only run if this script is called directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = initializeDatabase;
