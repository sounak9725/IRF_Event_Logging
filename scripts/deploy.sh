#!/bin/bash

# Deployment script for IRF Event Logging Bot
# This script handles zero-downtime deployment using Docker Compose

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Configuration
COMPOSE_FILE="docker-compose.yml"
SERVICE_NAME="discord-bot"
BACKUP_DIR="./backups"
IMAGE_FILE="bot-image.tar.gz"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored messages
print_status() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

print_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running!"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found!"
    print_warning "Please create .env file with required environment variables"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Load Docker image if present
if [ -f "$IMAGE_FILE" ]; then
    print_status "Loading Docker image..."
    docker load < "$IMAGE_FILE"
    rm -f "$IMAGE_FILE"
else
    print_warning "No image file found, building from Dockerfile..."
    docker-compose build
fi

# Get current container ID (if running)
CURRENT_CONTAINER=$(docker-compose ps -q $SERVICE_NAME 2>/dev/null || echo "")

# Backup current logs
if [ -n "$CURRENT_CONTAINER" ]; then
    print_status "Backing up logs..."
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    docker logs $CURRENT_CONTAINER > "$BACKUP_DIR/bot_logs_$TIMESTAMP.log" 2>&1 || true
fi

# Pull latest images (if using registry)
# docker-compose pull

# Stop old container gracefully
if [ -n "$CURRENT_CONTAINER" ]; then
    print_status "Stopping old container..."
    docker-compose stop $SERVICE_NAME
fi

# Start new container
print_status "Starting new container..."
docker-compose up -d $SERVICE_NAME

# Wait for health check
print_status "Waiting for health check..."
sleep 10

# Check if container is running
if docker-compose ps | grep -q "$SERVICE_NAME.*Up"; then
    print_status "✅ Container is running!"
else
    print_error "❌ Container failed to start!"
    print_warning "Rolling back..."
    
    # Attempt rollback
    docker-compose down
    exit 1
fi

# Health check endpoint
print_status "Checking health endpoint..."
for i in {1..10}; do
    if curl -f http://localhost:3000/health > /dev/null 2>&1; then
        print_status "✅ Health check passed!"
        break
    else
        if [ $i -eq 10 ]; then
            print_error "❌ Health check failed!"
            exit 1
        fi
        print_warning "Health check attempt $i/10 failed, retrying..."
        sleep 5
    fi
done

# Remove old container
if [ -n "$CURRENT_CONTAINER" ]; then
    print_status "Removing old container..."
    docker-compose rm -f $SERVICE_NAME 2>/dev/null || true
fi

# Clean up old images
print_status "Cleaning up old images..."
docker image prune -f

# Show running containers
print_status "Current running containers:"
docker-compose ps

# Show logs
print_status "Recent logs:"
docker-compose logs --tail=20 $SERVICE_NAME

print_status "🎉 Deployment completed successfully!"
print_status "Monitor logs with: docker-compose logs -f $SERVICE_NAME"
