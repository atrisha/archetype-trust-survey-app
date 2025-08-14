const { query } = require('../database/db');

/**
 * Utility functions for managing message sets in the trust survey database
 */

// List all available sets with message counts
async function listSets() {
  try {
    const result = await query(`
      SELECT 
        set_quant, 
        set_qual,
        COUNT(*) as total_messages,
        COUNT(CASE WHEN generated = 0 THEN 1 END) as human_messages,
        COUNT(CASE WHEN generated = 1 THEN 1 END) as ai_messages
      FROM messages 
      WHERE is_active = TRUE 
      GROUP BY set_quant, set_qual
      ORDER BY set_quant, set_qual
    `);
    
    console.log('\nAvailable Message Sets:');
    console.log('=======================');
    
    if (result.rows.length === 0) {
      console.log('No message sets found.');
      return;
    }
    
    result.rows.forEach(row => {
      console.log(`Set: Quant=${row.set_quant || 'NULL'}, Qual=${row.set_qual || 'NULL'}`);
      console.log(`  Total messages: ${row.total_messages}`);
      console.log(`  Human-written: ${row.human_messages}`);
      console.log(`  AI-generated: ${row.ai_messages}`);
      console.log('');
    });
    
    return result.rows;
  } catch (error) {
    console.error('Error listing sets:', error);
    throw error;
  }
}

// Get messages from a specific set
async function getMessagesFromSet(setQuant, setQual, limit = 10) {
  try {
    const result = await query(`
      SELECT id, message, generated, in_role, roll_value, set_quant, set_qual
      FROM messages 
      WHERE set_quant = $1 AND set_qual = $2 AND is_active = TRUE
      ORDER BY id
      LIMIT $3
    `, [setQuant, setQual, limit]);
    
    console.log(`\nMessages from set Quant=${setQuant}, Qual=${setQual} (showing first ${limit}):`);
    console.log('=' + '='.repeat(60));
    
    if (result.rows.length === 0) {
      console.log(`No messages found in set Quant=${setQuant}, Qual=${setQual}.`);
      return [];
    }
    
    result.rows.forEach((row, index) => {
      const type = row.generated === 0 ? 'Human' : 'AI';
      console.log(`${index + 1}. [${type}] ${row.message.substring(0, 80)}${row.message.length > 80 ? '...' : ''}`);
    });
    
    return result.rows;
  } catch (error) {
    console.error('Error getting messages from set:', error);
    throw error;
  }
}

// Update set values for existing messages
async function updateMessageSet(oldSetQuant, oldSetQual, newSetQuant, newSetQual) {
  try {
    const result = await query(`
      UPDATE messages 
      SET set_quant = $3, set_qual = $4
      WHERE set_quant = $1 AND set_qual = $2
      RETURNING COUNT(*)
    `, [oldSetQuant, oldSetQual, newSetQuant, newSetQual]);
    
    console.log(`Updated ${result.rowCount} messages from Quant=${oldSetQuant}, Qual=${oldSetQual} to Quant=${newSetQuant}, Qual=${newSetQual}`);
    return result.rowCount;
  } catch (error) {
    console.error('Error updating message set:', error);
    throw error;
  }
}

// Delete messages from a specific set
async function deleteMessageSet(setQuant, setQual, confirm = false) {
  if (!confirm) {
    console.log(`WARNING: This will delete all messages from set Quant=${setQuant}, Qual=${setQual}.`);
    console.log('To confirm, run with confirm=true parameter.');
    return;
  }
  
  try {
    const result = await query(`
      DELETE FROM messages 
      WHERE set_quant = $1 AND set_qual = $2
    `, [setQuant, setQual]);
    
    console.log(`Deleted ${result.rowCount} messages from set Quant=${setQuant}, Qual=${setQual}`);
    return result.rowCount;
  } catch (error) {
    console.error('Error deleting message set:', error);
    throw error;
  }
}

// Command line interface
if (require.main === module) {
  const command = process.argv[2];
  const param1 = process.argv[3];
  const param2 = process.argv[4];
  const param3 = process.argv[5];
  
  async function main() {
    try {
      switch (command) {
        case 'list':
          await listSets();
          break;
          
        case 'get':
          if (!param1 || !param2) {
            console.error('Usage: node manage-sets.js get <set-quant> <set-qual> [limit]');
            process.exit(1);
          }
          const setQuant = parseInt(param1);
          const setQual = parseInt(param2);
          const limit = param3 ? parseInt(param3) : 10;
          await getMessagesFromSet(setQuant, setQual, limit);
          break;
          
        case 'update':
          if (!param1 || !param2 || !process.argv[5] || !process.argv[6]) {
            console.error('Usage: node manage-sets.js update <old-set-quant> <old-set-qual> <new-set-quant> <new-set-qual>');
            process.exit(1);
          }
          const oldSetQuant = parseInt(param1);
          const oldSetQual = parseInt(param2);
          const newSetQuant = parseInt(process.argv[5]);
          const newSetQual = parseInt(process.argv[6]);
          await updateMessageSet(oldSetQuant, oldSetQual, newSetQuant, newSetQual);
          break;
          
        case 'delete':
          if (!param1 || !param2) {
            console.error('Usage: node manage-sets.js delete <set-quant> <set-qual> [confirm]');
            process.exit(1);
          }
          const delSetQuant = parseInt(param1);
          const delSetQual = parseInt(param2);
          const confirm = param3 === 'confirm';
          await deleteMessageSet(delSetQuant, delSetQual, confirm);
          break;
          
        default:
          console.log('Message Set Management Utility');
          console.log('==============================');
          console.log('');
          console.log('Commands:');
          console.log('  list                                           - List all message sets with counts');
          console.log('  get <set-quant> <set-qual> [limit]            - Show messages from a specific set');
          console.log('  update <old-quant> <old-qual> <new-quant> <new-qual> - Update set values');
          console.log('  delete <set-quant> <set-qual> confirm         - Delete all messages from a set');
          console.log('');
          console.log('Examples:');
          console.log('  node manage-sets.js list');
          console.log('  node manage-sets.js get 1 2 5');
          console.log('  node manage-sets.js update 1 2 3 4');
          console.log('  node manage-sets.js delete 1 2 confirm');
          process.exit(0);
      }
      
      console.log('\nOperation completed successfully!');
      process.exit(0);
    } catch (error) {
      console.error('Operation failed:', error.message);
      process.exit(1);
    }
  }
  
  main();
}

module.exports = {
  listSets,
  getMessagesFromSet,
  updateMessageSet,
  deleteMessageSet
};
