const { logger } = require('./logger');

/**
 * Simple metrics collection for bot performance monitoring
 */
class Metrics {
  constructor() {
    this.commandUsage = new Map();
    this.errorCounts = new Map();
    this.performanceMetrics = {
      startTime: Date.now(),
      commandsExecuted: 0,
      errorsEncountered: 0,
      memoryPeaks: []
    };
    
    // Start periodic metrics collection
    this.startPeriodicCollection();
  }

  /**
   * Record command usage
   */
  recordCommand(commandName, userId, guildId, executionTime = 0) {
    const key = commandName;
    const current = this.commandUsage.get(key) || { count: 0, totalTime: 0, users: new Set() };
    
    current.count++;
    current.totalTime += executionTime;
    current.users.add(userId);
    
    this.commandUsage.set(key, current);
    this.performanceMetrics.commandsExecuted++;
    
    logger.debug('Command executed', {
      command: commandName,
      user: userId,
      guild: guildId,
      executionTime: `${executionTime}ms`
    });
  }

  /**
   * Record error occurrence
   */
  recordError(errorType, errorMessage, context = {}) {
    const key = errorType;
    const current = this.errorCounts.get(key) || { count: 0, lastOccurrence: null, contexts: [] };
    
    current.count++;
    current.lastOccurrence = new Date();
    current.contexts.push({
      message: errorMessage,
      timestamp: new Date(),
      ...context
    });
    
    // Keep only last 10 error contexts to prevent memory bloat
    if (current.contexts.length > 10) {
      current.contexts = current.contexts.slice(-10);
    }
    
    this.errorCounts.set(key, current);
    this.performanceMetrics.errorsEncountered++;
    
    logger.error('Error recorded', {
      type: errorType,
      message: errorMessage,
      context
    });
  }

  /**
   * Get command usage statistics
   */
  getCommandStats() {
    const stats = {};
    
    for (const [command, data] of this.commandUsage.entries()) {
      stats[command] = {
        count: data.count,
        averageTime: data.totalTime / data.count,
        uniqueUsers: data.users.size
      };
    }
    
    return stats;
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const stats = {};
    
    for (const [errorType, data] of this.errorCounts.entries()) {
      stats[errorType] = {
        count: data.count,
        lastOccurrence: data.lastOccurrence,
        recentContexts: data.contexts.slice(-3) // Last 3 occurrences
      };
    }
    
    return stats;
  }

  /**
   * Get overall performance metrics
   */
  getPerformanceMetrics() {
    const uptime = Date.now() - this.performanceMetrics.startTime;
    const memUsage = process.memoryUsage();
    
    return {
      uptime: uptime,
      uptimeFormatted: this.formatUptime(uptime),
      commandsExecuted: this.performanceMetrics.commandsExecuted,
      errorsEncountered: this.performanceMetrics.errorsEncountered,
      errorRate: this.performanceMetrics.commandsExecuted > 0 
        ? (this.performanceMetrics.errorsEncountered / this.performanceMetrics.commandsExecuted * 100).toFixed(2) + '%'
        : '0%',
      memoryUsage: {
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
        external: Math.round(memUsage.external / 1024 / 1024) + ' MB'
      },
      memoryPeaks: this.performanceMetrics.memoryPeaks.slice(-5) // Last 5 peaks
    };
  }

  /**
   * Format uptime in human readable format
   */
  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Start periodic metrics collection
   */
  startPeriodicCollection() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
      
      // Record memory peaks (above 100MB)
      if (heapUsedMB > 100) {
        this.performanceMetrics.memoryPeaks.push({
          timestamp: new Date(),
          heapUsed: heapUsedMB
        });
        
        // Keep only last 20 peaks
        if (this.performanceMetrics.memoryPeaks.length > 20) {
          this.performanceMetrics.memoryPeaks = this.performanceMetrics.memoryPeaks.slice(-20);
        }
      }
      
      // Log periodic stats (every hour)
      if (Date.now() % (60 * 60 * 1000) < 60000) { // Roughly every hour
        const stats = this.getPerformanceMetrics();
        logger.info('Periodic metrics report', stats);
      }
    }, 60000); // Check every minute
  }

  /**
   * Generate metrics summary for Discord embed
   */
  generateSummary() {
    const performance = this.getPerformanceMetrics();
    const topCommands = Object.entries(this.getCommandStats())
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 5);
    
    const topErrors = Object.entries(this.getErrorStats())
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 3);

    return {
      performance,
      topCommands,
      topErrors,
      timestamp: new Date()
    };
  }
}

// Create singleton instance
const metrics = new Metrics();

module.exports = { Metrics, metrics };
