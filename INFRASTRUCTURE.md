# 🏗️ Infrastructure Documentation

Complete guide for deploying and scaling the IRF Event Logging Discord Bot with Docker, CI/CD, and production best practices.

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Docker Deployment](#docker-deployment)
3. [CI/CD Pipeline](#cicd-pipeline)
4. [Health Checks](#health-checks)
5. [Scaling](#scaling)
6. [Monitoring](#monitoring)
7. [Backup & Recovery](#backup--recovery)
8. [Troubleshooting](#troubleshooting)

---

## 🚀 Quick Start

### Prerequisites

- **Docker** >= 20.10
- **Docker Compose** >= 2.0
- **Git** (for CI/CD)
- **.env file** with required environment variables

### 1-Minute Deploy

```bash
# Clone repository
git clone <your-repo-url>
cd IRF_Event_Logging

# Create .env file
cp .env.example .env
# Edit .env with your values

# Start the bot
docker-compose up -d

# Check logs
docker-compose logs -f discord-bot
```

---

## 🐳 Docker Deployment

### Standard Deployment

**Single instance, recommended for most use cases**

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Restart
docker-compose restart

# Update
git pull
docker-compose build
docker-compose up -d
```

### Docker Commands Reference

```bash
# Build without cache
docker-compose build --no-cache

# View resource usage
docker stats irf-discord-bot

# Execute commands in container
docker-compose exec discord-bot node --version

# View container details
docker-compose ps

# Clean up old images
docker image prune -a
```

---

## ⚙️ CI/CD Pipeline

### GitHub Actions Setup

The bot includes automated CI/CD via GitHub Actions.

#### Required Secrets

Add these secrets to your GitHub repository (Settings → Secrets → Actions):

| Secret | Description | Example |
|--------|-------------|---------|
| `SERVER_HOST` | Your server IP/domain | `123.456.789.0` |
| `SERVER_USER` | SSH username | `ubuntu` |
| `SERVER_SSH_KEY` | Private SSH key | `-----BEGIN RSA...` |
| `SERVER_PORT` | SSH port (optional) | `22` |
| `DISCORD_WEBHOOK` | Notification webhook | `https://discord.com/api/webhooks/...` |
| `DOCKER_USERNAME` | Docker Hub username (optional) | `yourname` |
| `DOCKER_PASSWORD` | Docker Hub password (optional) | `your-token` |

#### Pipeline Workflow

```
Push to main/master
      ↓
  Run Tests
      ↓
Security Scan
      ↓
 Build Docker Image
      ↓
  Deploy to Server
      ↓
 Health Check
      ↓
   Notify Success
```

#### Manual Deployment

```bash
# Trigger manual deployment
# Go to: Actions → CI/CD Pipeline → Run workflow
```

#### Deploy Script

The deploy script (`scripts/deploy.sh`) handles:
- ✅ Zero-downtime deployment
- ✅ Health checks
- ✅ Automatic rollback on failure
- ✅ Log backups
- ✅ Docker cleanup

```bash
# Manual deploy on server
cd /opt/irf-bot
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

---

## 🏥 Health Checks

### Available Endpoints

The bot exposes HTTP endpoints for monitoring:

| Endpoint | Purpose | Response Code |
|----------|---------|---------------|
| `/health` | Overall health status | 200 (healthy), 503 (unhealthy) |
| `/metrics` | Performance metrics | 200 |
| `/ready` | Readiness probe (K8s) | 200 (ready), 503 (not ready) |
| `/live` | Liveness probe (K8s) | 200 |

### Example Responses

#### `/health`
```json
{
  "status": "healthy",
  "checks": {
    "discord": {
      "status": "healthy",
      "message": "Connected (42ms)"
    },
    "database": {
      "status": "healthy",
      "message": "Database connected"
    },
    "memory": {
      "status": "healthy",
      "message": "Memory usage: 145MB"
    },
    "uptime": {
      "status": "healthy",
      "message": "Uptime: 12.5h"
    }
  },
  "timestamp": "2025-11-04T17:00:00.000Z",
  "uptime": 45000,
  "version": "1.0.0"
}
```

#### `/metrics`
```json
{
  "uptime": 45000,
  "memory": {
    "heapUsed": 145,
    "heapTotal": 200,
    "rss": 180
  },
  "discord": {
    "ping": 42,
    "guilds": 5,
    "users": 1250,
    "ready": true
  },
  "database": {
    "connected": true
  },
  "rateLimiter": {
    "activeUsers": 15,
    "bannedUsers": 0,
    "globalCommands": 42
  },
  "timestamp": "2025-11-04T17:00:00.000Z"
}
```

### Testing Health Checks

```bash
# Local testing
curl http://localhost:3000/health

# Docker testing
docker exec irf-discord-bot curl http://localhost:3000/health

# From another container
curl http://discord-bot:3000/health
```

### Health Check Configuration

In `.env`:
```bash
HEALTH_CHECK_ENABLED=true          # Enable/disable health checks
HEALTH_CHECK_PORT=3000             # Port for health check server
```

---

## 📈 Scaling

### Why Scale?

Scale your bot when:
- Handling 10,000+ users
- Processing 1,000+ commands/hour
- Need high availability (99.9% uptime)
- Geographic distribution needed

### Horizontal Scaling

**Run multiple bot instances with load balancing**

```bash
# Use the scaling configuration
docker-compose -f docker-compose.scale.yml up -d

# Scale to 3 instances
docker-compose -f docker-compose.scale.yml up -d --scale discord-bot=3

# View all instances
docker-compose -f docker-compose.scale.yml ps
```

### Architecture (Scaled)

```
Internet
    ↓
NGINX Load Balancer (Port 3000)
    ↓
    ├── Bot Instance 1 (Port 3001)
    ├── Bot Instance 2 (Port 3002)
    └── Bot Instance 3 (Port 3003)
    ↓
Shared Redis (State)
    ↓
MongoDB (Database)
```

### Load Balancing Strategy

**NGINX** uses `least_conn` (least connections):
- Routes requests to instance with fewest active connections
- Health checks every 30s
- Automatic failover if instance fails
- Keeps 32 persistent connections

### Shared State (Redis)

When scaling, use Redis for shared state:

```javascript
// In your bot code
const Redis = require('ioredis');
const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: process.env.REDIS_PORT || 6379
});

// Store rate limit data
await redis.set(`ratelimit:${userId}`, JSON.stringify(data), 'EX', 3600);
```

### Resource Allocation

Per instance recommendations:

| Load | CPU | Memory | Instances |
|------|-----|--------|-----------|
| Light (<1k users) | 0.5 | 512MB | 1 |
| Medium (1k-5k) | 1.0 | 1GB | 2 |
| Heavy (5k-10k) | 2.0 | 2GB | 3 |
| Very Heavy (>10k) | 4.0 | 4GB | 5+ |

---

## 📊 Monitoring

### Prometheus + Grafana

**Optional monitoring stack included**

```bash
# Start monitoring
docker-compose -f docker-compose.scale.yml up -d prometheus grafana

# Access Grafana
open http://localhost:3030
# Default login: admin / admin
```

### Metrics Collected

- **Bot Performance:**
  - Uptime
  - Memory usage
  - Discord latency
  - Command execution times

- **Rate Limiter:**
  - Active users
  - Banned users
  - Commands per minute

- **Database:**
  - Connection status
  - Query performance
  - Active connections

- **System:**
  - CPU usage
  - Memory usage
  - Network I/O

### Grafana Dashboard

Import pre-built dashboard:
1. Open Grafana (http://localhost:3030)
2. Go to Dashboards → Import
3. Upload `grafana-dashboard.json` (if provided)
4. View real-time metrics

### Alerts

Configure alerts for:
- High memory usage (>80%)
- Bot disconnection
- Database failures
- Rate limit abuse

---

## 💾 Backup & Recovery

### Automatic Backups

```yaml
# Add to docker-compose.yml
mongodb-backup:
  image: tiredofit/db-backup
  environment:
    - DB_BACKUP_INTERVAL=1440  # Daily
    - DB_CLEANUP_TIME=10080     # 7 days retention
```

### Manual Backup

```bash
# Backup MongoDB
docker exec irf-mongodb mongodump --out=/backup/$(date +%Y%m%d)

# Backup logs
tar -czf logs-backup-$(date +%Y%m%d).tar.gz ./logs

# Backup .env (securely!)
gpg -c .env  # Encrypt with password
```

### Disaster Recovery

```bash
# 1. Stop containers
docker-compose down

# 2. Restore MongoDB
docker exec -i irf-mongodb mongorestore /backup/20251104

# 3. Restore .env
gpg -d .env.gpg > .env

# 4. Restart
docker-compose up -d

# 5. Verify
curl http://localhost:3000/health
```

### Backup Schedule

| What | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| MongoDB | Daily | 30 days | `./backups/` |
| Logs | Weekly | 90 days | `./logs/` |
| .env | On change | Forever | Secure vault |
| Code | On push | Forever | Git |

---

## 🔧 Troubleshooting

### Bot Won't Start

```bash
# Check logs
docker-compose logs discord-bot

# Common issues:
# 1. Invalid BOT_TOKEN
#    → Check .env file
# 2. MongoDB connection failed
#    → Check MONGODB_URI
# 3. Port already in use
#    → Change HEALTH_CHECK_PORT
```

### High Memory Usage

```bash
# Check memory
docker stats irf-discord-bot

# Restart to free memory
docker-compose restart discord-bot

# If persistent:
# 1. Check for memory leaks in logs
# 2. Increase memory limit in docker-compose.yml
# 3. Enable swap on host
```

### Health Check Fails

```bash
# Test endpoint
curl -v http://localhost:3000/health

# Check if port is open
netstat -tuln | grep 3000

# Check bot logs
docker-compose logs --tail=100 discord-bot

# Manually check Discord connection
docker-compose exec discord-bot node -e "console.log('Test')"
```

### Deployment Failed

```bash
# Check CI/CD logs in GitHub Actions

# Manual rollback
cd /opt/irf-bot
docker-compose down
docker pull irf-event-logging-bot:previous
docker-compose up -d

# Check health
curl http://localhost:3000/health
```

### Container Keeps Restarting

```bash
# View recent logs
docker logs irf-discord-bot --tail=50

# Check restart count
docker inspect irf-discord-bot | grep RestartCount

# Common causes:
# 1. Invalid environment variables
# 2. MongoDB not reachable
# 3. Discord API issues
# 4. Out of memory

# Disable auto-restart to debug
docker-compose up discord-bot  # Without -d
```

---

## 🎯 Best Practices

### Development

```bash
# Local development (no Docker)
npm install
npm run dev

# Test Docker build
docker build -t test .
docker run --env-file .env test
```

### Staging Environment

```bash
# Create staging compose file
cp docker-compose.yml docker-compose.staging.yml

# Modify for staging
# Use different ports, databases, etc.

# Deploy to staging
docker-compose -f docker-compose.staging.yml up -d
```

### Production Checklist

- [ ] `.env` file configured with production values
- [ ] All secrets rotated (BOT_TOKEN, API keys)
- [ ] Health checks enabled
- [ ] Monitoring configured (Prometheus/Grafana)
- [ ] Backups automated
- [ ] CI/CD pipeline tested
- [ ] Rate limiting enabled
- [ ] Input validation active
- [ ] Logs rotation configured
- [ ] Resource limits set

---

## 📚 Additional Resources

### Commands Reference

```bash
# Docker
docker-compose up -d          # Start
docker-compose down           # Stop
docker-compose restart        # Restart
docker-compose logs -f        # View logs
docker-compose ps             # List containers
docker-compose exec <service> <cmd>  # Run command

# Deployment
./scripts/deploy.sh           # Deploy
git push origin main          # Trigger CI/CD

# Monitoring
curl http://localhost:3000/health    # Health check
curl http://localhost:3000/metrics   # Metrics
docker stats                          # Resource usage

# Maintenance
docker system prune -a        # Clean up Docker
docker volume prune           # Clean up volumes
docker network prune          # Clean up networks
```

### File Structure

```
IRF_Event_Logging/
├── Dockerfile                # Docker build config
├── docker-compose.yml        # Single instance deployment
├── docker-compose.scale.yml  # Multi-instance deployment
├── .dockerignore            # Docker ignore rules
├── nginx.conf               # Load balancer config
├── prometheus.yml           # Metrics collection config
├── .github/
│   └── workflows/
│       └── ci-cd.yml       # CI/CD pipeline
├── scripts/
│   └── deploy.sh           # Deployment script
└── .env                     # Environment variables (not in git)
```

---

## 🆘 Support

### Getting Help

1. **Check logs:** `docker-compose logs -f`
2. **Health endpoint:** `curl http://localhost:3000/health`
3. **GitHub Issues:** Report bugs
4. **Documentation:** Read INFRASTRUCTURE.md

### Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| Port 3000 in use | Change `HEALTH_CHECK_PORT` in .env |
| MongoDB connection timeout | Check `MONGODB_URI`, ensure network connectivity |
| Bot not responding | Check Discord API status, verify BOT_TOKEN |
| Out of memory | Increase memory limit in docker-compose.yml |
| CI/CD fails | Check GitHub secrets, SSH key permissions |

---

## ✨ Summary

You now have:
✅ **Docker** containerization for consistent deployment  
✅ **CI/CD** pipeline for automated deployments  
✅ **Health checks** for monitoring  
✅ **Scaling** configuration for high availability  
✅ **Monitoring** with Prometheus + Grafana  
✅ **Backup** automation  
✅ **Load balancing** with NGINX  
✅ **Zero-downtime** deployment  

Your bot is **production-ready** and **enterprise-grade**! 🚀

---

*Last Updated: November 2025*  
*Infrastructure Version: 1.0*
