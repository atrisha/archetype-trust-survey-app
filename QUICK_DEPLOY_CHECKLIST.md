# 🚀 Quick Heroku Deployment Checklist

## ✅ Pre-Deployment Checklist

### 1. Install Prerequisites
- [ ] Install Heroku CLI: `brew install heroku/brew/heroku`
- [ ] Login to Heroku: `heroku login`
- [ ] Ensure Git is initialized: `git status`

### 2. Prepare Your App
- [ ] Replace your root `package.json` with `package-heroku.json`:
  ```bash
  mv package.json package-react.json
  mv package-heroku.json package.json
  ```

### 3. Create Heroku App
```bash
# Create new Heroku app (replace with your preferred name)
heroku create your-trust-survey-app-name

# Add PostgreSQL database
heroku addons:create heroku-postgresql:essential-0

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set NPM_CONFIG_PRODUCTION=false

# Check your config
heroku config
```

### 4. Deploy Your App
```bash
# Ensure all files are committed
git add .
git commit -m "Prepare for Heroku deployment"

# Deploy to Heroku
git push heroku main
# OR if you're on a different branch:
# git push heroku your-branch:main
```

### 5. Initialize Database with Data
```bash
# Import your CSV data
heroku run node server/scripts/import-csv.js

# Verify the deployment
heroku open
heroku logs --tail
```

## 🔧 Important Commands

### Monitoring
```bash
# View logs
heroku logs --tail

# Check dyno status  
heroku ps

# Restart app
heroku restart
```

### Database Management
```bash
# Access database
heroku pg:psql

# View database info
heroku pg:info

# Create backup
heroku pg:backups:capture
```

### Debugging
```bash
# Run commands on Heroku
heroku run node server/scripts/analyze-sessions.js

# Check environment variables
heroku config

# Clear build cache (if build fails)
heroku plugins:install heroku-builds
heroku builds:cache:purge
```

## 📋 Expected Results

After deployment, these should work:
- [ ] **App**: `https://your-app-name.herokuapp.com`
- [ ] **Health Check**: `https://your-app-name.herokuapp.com/health`
- [ ] **Create Session**: POST to `https://your-app-name.herokuapp.com/api/sessions`
- [ ] **Get Messages**: GET `https://your-app-name.herokuapp.com/api/sessions/{id}/messages`

## ⚠️ Troubleshooting

### Common Issues:
1. **Build fails**: Check logs with `heroku logs --tail`
2. **Database connection fails**: Verify `heroku config` shows `DATABASE_URL`
3. **React app doesn't load**: Ensure build completed successfully
4. **API endpoints 404**: Check server.js routing and build process

### If something goes wrong:
```bash
# Check what went wrong
heroku logs --tail

# Try rebuilding
git commit --allow-empty -m "Trigger rebuild"
git push heroku main

# Reset if needed
heroku releases
heroku rollback v[previous-version-number]
```

## 🎉 Success Indicators

Your deployment is successful when:
- ✅ Heroku build completes without errors
- ✅ Release phase runs successfully  
- ✅ Web dyno starts
- ✅ Health check returns 200 OK
- ✅ You can create a session via API
- ✅ Sessions return balanced set assignments
- ✅ Messages are retrieved correctly

## 💡 Tips

- Test your app thoroughly before deploying
- Keep your CSV data file under 10MB for faster uploads
- Monitor your database row usage (10k limit on free tier)
- Consider upgrading to paid dynos for production use
- Set up monitoring and alerts for production apps

## 🔗 Quick Links

- **Heroku Dashboard**: https://dashboard.heroku.com/apps/your-app-name
- **Database Dashboard**: https://data.heroku.com/
- **Heroku Dev Center**: https://devcenter.heroku.com/
- **PostgreSQL Docs**: https://devcenter.heroku.com/articles/heroku-postgresql
