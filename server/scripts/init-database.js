const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function initializeDatabase() {
  // First connect to postgres database to create our database
  const adminPool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: 'postgres', // Connect to default postgres database
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'trust_survey';
    
    console.log(`Creating database '${dbName}' if it doesn't exist...`);
    await adminPool.query(`CREATE DATABASE ${dbName}`);
    console.log(`Database '${dbName}' created successfully or already exists.`);
  } catch (error) {
    if (error.code === '42P04') {
      console.log(`Database '${process.env.DB_NAME || 'trust_survey'}' already exists.`);
    } else {
      console.error('Error creating database:', error.message);
      throw error;
    }
  } finally {
    await adminPool.end();
  }

  // Now connect to our database to create tables
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'trust_survey',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    // Read and execute schema SQL
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Executing database schema...');
    await pool.query(schemaSql);
    console.log('Database schema created successfully!');
    
    // Check if messages table has data, if not, suggest importing CSV data
    const messageCount = await pool.query('SELECT COUNT(*) FROM messages');
    if (messageCount.rows[0].count === '0') {
      console.log('\nNOTE: Messages table is empty. You can import your CSV data using the import script.');
      console.log('Run: node scripts/import-csv.js path/to/your/data.csv');
    }

  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase()
    .then(() => {
      console.log('Database initialization completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
