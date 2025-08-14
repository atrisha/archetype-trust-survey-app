const { query } = require('../database/db');

/**
 * Utility functions for analyzing session and set distribution
 */

// Analyze current session distribution
async function analyzeSessionDistribution() {
  try {
    console.log('Session Distribution Analysis');
    console.log('============================\n');
    
    // Get total session count
    const totalResult = await query('SELECT COUNT(*) as total FROM survey_sessions');
    const totalSessions = totalResult.rows[0].total;
    console.log(`Total sessions: ${totalSessions}`);
    
    if (totalSessions === 0) {
      console.log('No sessions found.');
      return;
    }
    
    // Get distribution by set_quant
    const quantResult = await query(`
      SELECT 
        set_quant, 
        COUNT(*) as session_count,
        ROUND((COUNT(*) * 100.0 / $1), 2) as percentage
      FROM survey_sessions 
      WHERE set_quant IS NOT NULL
      GROUP BY set_quant 
      ORDER BY set_quant
    `, [totalSessions]);
    
    console.log('\nSet Quant Distribution:');
    quantResult.rows.forEach(row => {
      console.log(`  Set ${row.set_quant}: ${row.session_count} sessions (${row.percentage}%)`);
    });
    
    // Get distribution by set_qual
    const qualResult = await query(`
      SELECT 
        set_qual, 
        COUNT(*) as session_count,
        ROUND((COUNT(*) * 100.0 / $1), 2) as percentage
      FROM survey_sessions 
      WHERE set_qual IS NOT NULL
      GROUP BY set_qual 
      ORDER BY set_qual
    `, [totalSessions]);
    
    console.log('\nSet Qual Distribution:');
    qualResult.rows.forEach(row => {
      console.log(`  Set ${row.set_qual}: ${row.session_count} sessions (${row.percentage}%)`);
    });
    
    // Get combined distribution
    const combinedResult = await query(`
      SELECT 
        set_quant, 
        set_qual, 
        COUNT(*) as session_count
      FROM survey_sessions 
      WHERE set_quant IS NOT NULL AND set_qual IS NOT NULL
      GROUP BY set_quant, set_qual 
      ORDER BY set_quant, set_qual
    `);
    
    console.log('\nCombined Set Distribution:');
    combinedResult.rows.forEach(row => {
      console.log(`  Quant=${row.set_quant}, Qual=${row.set_qual}: ${row.session_count} sessions`);
    });
    
    // Show available sets not yet used
    const availableQuantResult = await query(`
      SELECT DISTINCT m.set_quant
      FROM messages m
      WHERE m.set_quant IS NOT NULL 
      AND m.set_quant NOT IN (
        SELECT DISTINCT s.set_quant 
        FROM survey_sessions s 
        WHERE s.set_quant IS NOT NULL
      )
      ORDER BY m.set_quant
    `);
    
    const availableQualResult = await query(`
      SELECT DISTINCT m.set_qual
      FROM messages m
      WHERE m.set_qual IS NOT NULL 
      AND m.set_qual NOT IN (
        SELECT DISTINCT s.set_qual 
        FROM survey_sessions s 
        WHERE s.set_qual IS NOT NULL
      )
      ORDER BY m.set_qual
    `);
    
    if (availableQuantResult.rows.length > 0) {
      console.log('\\nUnused Set Quant values:');
      console.log('  ' + availableQuantResult.rows.map(r => r.set_quant).join(', '));
    }
    
    if (availableQualResult.rows.length > 0) {
      console.log('\\nUnused Set Qual values:');
      console.log('  ' + availableQualResult.rows.map(r => r.set_qual).join(', '));
    }
    
  } catch (error) {
    console.error('Error analyzing session distribution:', error);
    throw error;
  }
}

// Show what the next assignment would be
async function showNextAssignment() {
  try {
    const quantResult = await query('SELECT assign_set_quant() as next_set_quant');
    const qualResult = await query('SELECT assign_set_qual() as next_set_qual');
    
    const nextSetQuant = quantResult.rows[0].next_set_quant;
    const nextSetQual = qualResult.rows[0].next_set_qual;
    
    console.log('\\nNext Assignment Prediction:');
    console.log(`  Next set_quant: ${nextSetQuant}`);
    console.log(`  Next set_qual: ${nextSetQual}`);
    
    // Show message counts for this combination
    const messageResult = await query(`
      SELECT 
        message_type,
        COUNT(*) as message_count
      FROM get_messages_for_session($1, $2)
      GROUP BY message_type
    `, [nextSetQuant, nextSetQual]);
    
    console.log('  Messages available for this combination:');
    messageResult.rows.forEach(row => {
      console.log(`    ${row.message_type}: ${row.message_count} messages`);
    });
    
  } catch (error) {
    console.error('Error showing next assignment:', error);
    throw error;
  }
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2];
  
  async function main() {
    try {
      switch (command) {
        case 'analyze':
        case 'distribution':
          await analyzeSessionDistribution();
          await showNextAssignment();
          break;
          
        case 'next':
          await showNextAssignment();
          break;
          
        default:
          console.log('Session Analysis Utility');
          console.log('=======================');
          console.log('');
          console.log('Commands:');
          console.log('  analyze      - Show detailed session and set distribution analysis');
          console.log('  next         - Show what the next session assignment would be');
          console.log('');
          console.log('Examples:');
          console.log('  node analyze-sessions.js analyze');
          console.log('  node analyze-sessions.js next');
          process.exit(0);
      }
      
      console.log('\\nAnalysis completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('Analysis failed:', error.message);
      process.exit(1);
    }
  }
  
  main();
}

module.exports = {
  analyzeSessionDistribution,
  showNextAssignment
};
