const fs = require('fs');
const path = require('path');

/**
 * Enhanced logging utility with multiple levels and file output
 */
class Logger {
  constructor(options = {}) {
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    
    this.currentLevel = this.levels[options.level?.toUpperCase()] ?? this.levels.INFO;
    this.enableFile = options.enableFile ?? true;
    this.enableConsole = options.enableConsole ?? true;
    this.logDir = options.logDir ?? path.join(__dirname, '..', 'logs');
    
    // Create logs directory if it doesn't exist
    if (this.enableFile && !fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Format log message with timestamp and level
   */
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level}] ${message}${metaStr}`;
  }

  /**
   * Write to log file
   */
  writeToFile(level, formattedMessage) {
    if (!this.enableFile) return;
    
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logDir, `${date}.log`);
    
    try {
      fs.appendFileSync(logFile, formattedMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  /**
   * Log message with specified level
   */
  log(level, message, meta = {}) {
    const levelValue = this.levels[level];
    if (levelValue > this.currentLevel) return;

    const formattedMessage = this.formatMessage(level, message, meta);
    
    if (this.enableConsole) {
      const consoleMethod = level === 'ERROR' ? 'error' : 
                           level === 'WARN' ? 'warn' : 
                           level === 'DEBUG' ? 'debug' : 'log';
      console[consoleMethod](formattedMessage);
    }
    
    this.writeToFile(level, formattedMessage);
  }

  error(message, meta = {}) {
    this.log('ERROR', message, meta);
  }

  warn(message, meta = {}) {
    this.log('WARN', message, meta);
  }

  info(message, meta = {}) {
    this.log('INFO', message, meta);
  }

  debug(message, meta = {}) {
    this.log('DEBUG', message, meta);
  }

  /**
   * Clean old log files (older than specified days)
   */
  cleanOldLogs(daysToKeep = 30) {
    if (!this.enableFile || !fs.existsSync(this.logDir)) return;

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    try {
      const files = fs.readdirSync(this.logDir);
      
      for (const file of files) {
        if (!file.endsWith('.log')) continue;
        
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < cutoffDate) {
          fs.unlinkSync(filePath);
          this.info(`Cleaned old log file: ${file}`);
        }
      }
    } catch (error) {
      this.error('Failed to clean old logs:', { error: error.message });
    }
  }
}

// Create default logger instance
const logger = new Logger({
  level: process.env.LOG_LEVEL || 'INFO',
  enableFile: process.env.NODE_ENV === 'production'
});

module.exports = { Logger, logger };
