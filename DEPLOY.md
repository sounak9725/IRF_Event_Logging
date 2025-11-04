# 🚀 Quick Deployment Guide

Get your Discord bot running in production in **5 minutes**.

---

## ⚡ Option 1: Docker (Recommended)

### Step 1: Prerequisites
```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Step 2: Configure Environment
```bash
# Clone repository
git clone <your-repo-url>
cd IRF_Event_Logging

# Create .env file
cp .env.example .env

# Edit with your values
nano .env
```

Required variables:
```bash
BOT_TOKEN=your_discord_bot_token
MONGODB_URI=your_mongodb_connection_string
MP_DISCIPLINE_URI=your_mp_database_uri
ROWIFI_API_KEY=your_rowifi_api_key
MAIN_SERVER_ID=your_main_discord_server_id
ADMIN_SERVER_ID=your_admin_server_id
LOG_CHANNEL_ID=your_log_channel_id
```

### Step 3: Deploy
```bash
# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f discord-bot

# Verify health
curl http://localhost:3000/health
```

**Done!** Your bot is running. ✅

---

## 🖥️ Option 2: Manual (Node.js)

### Step 1: Install Node.js
```bash
# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify
node --version  # Should be v20.x.x
```

### Step 2: Install Dependencies
```bash
cd IRF_Event_Logging
npm install
```

### Step 3: Configure
```bash
cp .env.example .env
nano .env  # Add your values
```

### Step 4: Start Bot
```bash
# Production
node index.js

# With PM2 (keeps running)
npm install -g pm2
pm2 start index.js --name irf-bot
pm2 save
pm2 startup
```

---

## 🔄 Auto-Deployment with CI/CD

### Step 1: GitHub Secrets

Add to your repository (Settings → Secrets → Actions):

| Secret | Value |
|--------|-------|
| `SERVER_HOST` | Your server IP |
| `SERVER_USER` | SSH username |
| `SERVER_SSH_KEY` | Your private SSH key |
| `DISCORD_WEBHOOK` | Notification webhook URL |

### Step 2: Push to Deploy
```bash
git add .
git commit -m "Deploy bot"
git push origin main
```

GitHub Actions will automatically:
1. ✅ Run tests
2. ✅ Build Docker image
3. ✅ Deploy to your server
4. ✅ Run health checks
5. ✅ Notify you on Discord

---

## 📊 Post-Deployment

### Verify Everything Works
```bash
# Check bot status
docker-compose ps

# View logs
docker-compose logs --tail=50 discord-bot

# Test health endpoint
curl http://localhost:3000/health

# Test metrics endpoint
curl http://localhost:3000/metrics
```

### Monitor Performance
```bash
# Resource usage
docker stats irf-discord-bot

# Live logs
docker-compose logs -f discord-bot
```

### Test Bot Commands
Go to Discord and try:
```
/logevent_mp event_type:Training ...
/staffregister user:@someone email:test@example.com
/add_case offender:TestUser ...
```

---

## 🔥 Quick Commands

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart
docker-compose restart

# Update
git pull && docker-compose up -d --build

# Logs
docker-compose logs -f

# Health Check
curl http://localhost:3000/health
```

---

## 🛠️ Troubleshooting

### Bot Not Starting?
```bash
# Check logs
docker-compose logs discord-bot

# Most common issues:
# 1. Invalid BOT_TOKEN → Check .env
# 2. MongoDB not reachable → Check MONGODB_URI
# 3. Port 3000 in use → Change HEALTH_CHECK_PORT
```

### Health Check Fails?
```bash
# Test manually
curl -v http://localhost:3000/health

# Check if bot is ready
docker-compose exec discord-bot node -e "console.log('alive')"
```

### Commands Not Working?
```bash
# Verify rate limiting isn't blocking
curl http://localhost:3000/metrics | grep rateLimiter

# Check input validation
# Look for validation errors in logs
docker-compose logs | grep "Validation Failed"
```

---

## 📚 Next Steps

1. **Read INFRASTRUCTURE.md** for advanced configuration
2. **Set up monitoring** with Prometheus + Grafana
3. **Configure backups** for MongoDB
4. **Enable scaling** if handling 10k+ users
5. **Set up alerts** for downtime/errors

---

## ✅ Deployment Checklist

- [ ] Docker installed
- [ ] .env file configured
- [ ] MongoDB accessible
- [ ] Discord bot token valid
- [ ] Bot started with `docker-compose up -d`
- [ ] Health check returns 200: `curl http://localhost:3000/health`
- [ ] Bot responds in Discord
- [ ] Logs look normal: `docker-compose logs`
- [ ] CI/CD secrets configured (if using)
- [ ] Monitoring set up (optional)
- [ ] Backups configured (recommended)

---

## 🎉 Success!

Your Discord bot is now running in production with:
- ✅ Docker containerization
- ✅ Health monitoring
- ✅ Rate limiting
- ✅ Input validation
- ✅ Auto-restart on failure
- ✅ Production-grade security

**Need help?** Check INFRASTRUCTURE.md or create a GitHub issue.

*Deployment Time: ~5 minutes*  
*Difficulty: Easy*
