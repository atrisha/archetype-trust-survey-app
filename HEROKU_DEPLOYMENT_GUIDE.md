# Heroku Deployment Guide for Trust Survey App

## Prerequisites

1. **Install Heroku CLI**
   ```bash
   # macOS (using Homebrew)
   brew install heroku/brew/heroku
   
   # Or download from: https://devcenter.heroku.com/articles/heroku-cli
   ```

2. **Git Repository**
   - Ensure your project is in a Git repository
   - Commit all your changes before deploying

## Step 1: Project Structure Setup

Your app has a React frontend and Node.js backend. We'll deploy them as a single app with the server serving the built React files.

### 1.1 Create Root Package.json
Create a `package.json` in your root directory (if not already present):

```json
{
  "name": "trust-survey-app-full",
  "version": "1.0.0",
  "description": "Trust Survey Application with React frontend and Node.js backend",
  "main": "server/server.js",
  "scripts": {
    "build": "npm install && npm run build:client && npm run build:server",
    "build:client": "npm run build --prefix .",
    "build:server": "npm install --prefix server",
    "start": "node server/server.js",
    "heroku-postbuild": "npm run build:client"
  },
  "engines": {
    "node": "18.x",
    "npm": "9.x"
  }
}
```

### 1.2 Update Server to Serve Static Files
The server needs to serve the built React app. Update `server/server.js`:

```javascript
// Add this after your existing middleware, before your API routes
const path = require('path');

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../build')));

// Your existing API routes here...

// Catch all handler: send back React's index.html file for any non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
  }
});
```

## Step 2: Database Setup

### 2.1 Add Heroku Postgres Add-on
```bash
# Login to Heroku
heroku login

# Create a new Heroku app
heroku create your-trust-survey-app-name

# Add PostgreSQL database
heroku addons:create heroku-postgresql:essential-0 --app your-trust-survey-app-name

# Get database URL
heroku config:get DATABASE_URL --app your-trust-survey-app-name
```

### 2.2 Update Database Configuration
Update `server/database/db.js` to handle Heroku's database connection:

```javascript
const { Pool } = require('pg');
require('dotenv').config();

// Configure connection for Heroku or local development
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.DB_CONNECTION_STRING,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  transaction: async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};
```

### 2.3 Create Database Initialization Script
Create `server/scripts/deploy-init.js`:

```javascript
const { query } = require('../database/db');
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
  try {
    console.log('Initializing database schema...');
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Split schema into individual commands
    const commands = schema.split(';').filter(cmd => cmd.trim());
    
    for (const command of commands) {
      if (command.trim()) {
        try {
          await query(command);
        } catch (error) {
          // Ignore errors for existing objects
          if (!error.message.includes('already exists')) {
            console.error('Schema error:', error.message);
          }
        }
      }
    }
    
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

initializeDatabase();
```

## Step 3: Environment Configuration

### 3.1 Create Production Environment File
Create `server/.env.production`:

```env
NODE_ENV=production
PORT=5001
```

### 3.2 Set Heroku Environment Variables
```bash
# Set environment variables
heroku config:set NODE_ENV=production --app your-trust-survey-app-name
heroku config:set NPM_CONFIG_PRODUCTION=false --app your-trust-survey-app-name

# Your DATABASE_URL should already be set by the PostgreSQL addon
```

## Step 4: Configure Heroku Build

### 4.1 Create Procfile
Create a `Procfile` in your root directory:

```
release: node server/scripts/deploy-init.js
web: node server/server.js
```

### 4.2 Create .gitignore Updates
Ensure your `.gitignore` includes:

```gitignore
node_modules/
npm-debug.log
.env
.env.local
.env.production
build/
dist/
.DS_Store
```

## Step 5: Deploy to Heroku

### 5.1 Initialize Git (if not already done)
```bash
git init
git add .
git commit -m "Initial commit for Heroku deployment"
```

### 5.2 Connect to Heroku
```bash
# Add Heroku remote
heroku git:remote -a your-trust-survey-app-name

# Or if you already created the app
git remote add heroku https://git.heroku.com/your-trust-survey-app-name.git
```

### 5.3 Deploy
```bash
# Deploy to Heroku
git push heroku main

# If you're on a different branch
git push heroku your-branch-name:main
```

### 5.4 Initialize Database with Data
```bash
# Run the CSV import script (if needed)
heroku run node server/scripts/import-csv.js --app your-trust-survey-app-name

# Check logs
heroku logs --tail --app your-trust-survey-app-name
```

## Step 6: Post-Deployment

### 6.1 Open Your App
```bash
heroku open --app your-trust-survey-app-name
```

### 6.2 Monitor and Debug
```bash
# View logs
heroku logs --tail --app your-trust-survey-app-name

# Check dyno status
heroku ps --app your-trust-survey-app-name

# Scale up if needed
heroku ps:scale web=1 --app your-trust-survey-app-name
```

### 6.3 Database Management
```bash
# Access database directly
heroku pg:psql --app your-trust-survey-app-name

# View database info
heroku pg:info --app your-trust-survey-app-name

# Create database backup
heroku pg:backups:capture --app your-trust-survey-app-name
```

## Step 7: Domain and SSL (Optional)

### 7.1 Custom Domain
```bash
# Add custom domain
heroku domains:add yourdomain.com --app your-trust-survey-app-name

# Enable SSL
heroku certs:auto:enable --app your-trust-survey-app-name
```

## Troubleshooting

### Common Issues:

1. **Build Failures**
   ```bash
   # Clear build cache
   heroku plugins:install heroku-builds
   heroku builds:cache:purge --app your-trust-survey-app-name
   ```

2. **Database Connection Issues**
   ```bash
   # Check database connection
   heroku config --app your-trust-survey-app-name
   heroku pg:info --app your-trust-survey-app-name
   ```

3. **Application Errors**
   ```bash
   # View detailed logs
   heroku logs --tail --app your-trust-survey-app-name
   
   # Restart app
   heroku restart --app your-trust-survey-app-name
   ```

## Important Notes

- Heroku's free tier has limitations; consider upgrading for production use
- Database has row limits on free tier (10,000 rows for Hobby tier)
- Apps on free tier sleep after 30 minutes of inactivity
- Always test your deployment thoroughly before going live
- Keep your environment variables secure and never commit them to Git

## Expected URLs After Deployment

- **Frontend**: `https://your-trust-survey-app-name.herokuapp.com`
- **API Health Check**: `https://your-trust-survey-app-name.herokuapp.com/health`
- **API Sessions**: `https://your-trust-survey-app-name.herokuapp.com/api/sessions`

Your trust survey app with intelligent set-based message assignment will be fully functional on Heroku!
