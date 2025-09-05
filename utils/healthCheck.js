const { logger } = require('./logger');
const mongoose = require('mongoose');

/**
 * Health check utility for monitoring bot status
 */
class HealthCheck {
  constructor(client) {
    this.client = client;
    this.checks = new Map();
    this.lastHealthReport = null;
    
    // Register default health checks
    this.registerCheck('discord', () => this.checkDiscordConnection());
    this.registerCheck('database', () => this.checkDatabaseConnection());
    this.registerCheck('memory', () => this.checkMemoryUsage());
    this.registerCheck('uptime', () => this.checkUptime());
  }

  /**
   * Register a new health check
   */
  registerCheck(name, checkFunction) {
    this.checks.set(name, checkFunction);
  }

  /**
   * Check Discord connection status
   */
  async checkDiscordConnection() {
    try {
      if (!this.client || !this.client.isReady()) {
        return { status: 'unhealthy', message: 'Discord client not ready' };
      }

      const ping = this.client.ws.ping;
      if (ping > 500) {
        return { status: 'degraded', message: `High latency: ${ping}ms` };
      }

      return { status: 'healthy', message: `Connected (${ping}ms)` };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  /**
   * Check database connection status
   */
  async checkDatabaseConnection() {
    try {
      const state = mongoose.connection.readyState;
      const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      };

      if (state === 1) {
        return { status: 'healthy', message: 'Database connected' };
      } else if (state === 2) {
        return { status: 'degraded', message: 'Database connecting' };
      } else {
        return { status: 'unhealthy', message: `Database ${states[state]}` };
      }
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  /**
   * Check memory usage
   */
  async checkMemoryUsage() {
    try {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      
      if (heapUsedMB > 200) {
        return { status: 'unhealthy', message: `High memory usage: ${heapUsedMB}MB` };
      } else if (heapUsedMB > 150) {
        return { status: 'degraded', message: `Elevated memory usage: ${heapUsedMB}MB` };
      }

      return { status: 'healthy', message: `Memory usage: ${heapUsedMB}MB` };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  /**
   * Check uptime
   */
  async checkUptime() {
    try {
      const uptimeMs = process.uptime() * 1000;
      const uptimeHours = uptimeMs / (1000 * 60 * 60);
      
      if (uptimeHours < 0.1) { // Less than 6 minutes
        return { status: 'degraded', message: 'Recently restarted' };
      }

      return { 
        status: 'healthy', 
        message: `Uptime: ${Math.round(uptimeHours * 100) / 100}h` 
      };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  /**
   * Run all health checks
   */
  async runAllChecks() {
    const results = {};
    let overallStatus = 'healthy';

    for (const [name, checkFunction] of this.checks.entries()) {
      try {
        const result = await checkFunction();
        results[name] = result;

        // Determine overall status
        if (result.status === 'unhealthy') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'degraded' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        results[name] = { 
          status: 'unhealthy', 
          message: `Check failed: ${error.message}` 
        };
        overallStatus = 'unhealthy';
      }
    }

    const healthReport = {
      timestamp: new Date(),
      overallStatus,
      checks: results
    };

    this.lastHealthReport = healthReport;
    
    // Log health status changes
    if (overallStatus === 'unhealthy') {
      logger.error('Health check failed', healthReport);
    } else if (overallStatus === 'degraded') {
      logger.warn('Health check degraded', healthReport);
    } else {
      logger.debug('Health check passed', healthReport);
    }

    return healthReport;
  }

  /**
   * Get the last health report
   */
  getLastReport() {
    return this.lastHealthReport;
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(intervalMinutes = 5) {
    setInterval(async () => {
      await this.runAllChecks();
    }, intervalMinutes * 60 * 1000);

    logger.info(`Health checks started (every ${intervalMinutes} minutes)`);
  }

  /**
   * Generate health status for Discord embed
   */
  generateStatusEmbed() {
    const report = this.lastHealthReport;
    if (!report) return null;

    const statusEmojis = {
      healthy: '🟢',
      degraded: '🟡',
      unhealthy: '🔴'
    };

    const fields = Object.entries(report.checks).map(([name, check]) => ({
      name: `${statusEmojis[check.status]} ${name.charAt(0).toUpperCase() + name.slice(1)}`,
      value: check.message,
      inline: true
    }));

    return {
      title: `${statusEmojis[report.overallStatus]} Bot Health Status`,
      color: report.overallStatus === 'healthy' ? 0x00ff00 : 
             report.overallStatus === 'degraded' ? 0xffff00 : 0xff0000,
      fields,
      timestamp: report.timestamp,
      footer: { text: 'Last updated' }
    };
  }
}

module.exports = { HealthCheck };
