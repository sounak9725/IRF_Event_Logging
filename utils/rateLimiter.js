/**
 * Rate Limiter Utility
 * Protects against command spam and abuse
 */

class RateLimiter {
  constructor() {
    this.userCommandCounts = new Map(); // userId -> { count, resetTime }
    this.globalCommandCounts = new Map(); // commandName -> { count, resetTime }
    this.ipBans = new Set(); // Set of banned user IDs
    
    // Configuration
    this.config = {
      // Per-user limits
      userLimits: {
        commands: 10,        // Max commands per window
        windowMs: 60000,     // 1 minute window
        blockDurationMs: 300000 // 5 minute block
      },
      
      // Per-command global limits
      globalLimits: {
        commands: 100,       // Max global commands per window
        windowMs: 60000      // 1 minute window
      },
      
      // Sensitive command limits (add_case, staffregister, etc.)
      sensitiveLimits: {
        commands: 5,         // Max 5 per window
        windowMs: 300000     // 5 minute window
      }
    };
    
    // Cleanup interval
    this.startCleanup();
  }
  
  /**
   * Check if user is rate limited
   * @param {string} userId - Discord user ID
   * @param {string} commandName - Command name
   * @returns {{ allowed: boolean, retryAfter?: number, reason?: string }}
   */
  checkRateLimit(userId, commandName) {
    const now = Date.now();
    
    // Check if user is banned
    if (this.ipBans.has(userId)) {
      return {
        allowed: false,
        reason: 'You have been temporarily blocked due to abuse. Please contact an administrator.'
      };
    }
    
    // Check user rate limit
    const userLimit = this.checkUserLimit(userId, now);
    if (!userLimit.allowed) {
      return userLimit;
    }
    
    // Check sensitive command limits
    const isSensitive = this.isSensitiveCommand(commandName);
    if (isSensitive) {
      const sensitiveLimit = this.checkSensitiveLimit(userId, commandName, now);
      if (!sensitiveLimit.allowed) {
        return sensitiveLimit;
      }
    }
    
    // Check global command limit
    const globalLimit = this.checkGlobalLimit(commandName, now);
    if (!globalLimit.allowed) {
      return globalLimit;
    }
    
    // Record this command execution
    this.recordExecution(userId, commandName, now);
    
    return { allowed: true };
  }
  
  /**
   * Check per-user rate limit
   */
  checkUserLimit(userId, now) {
    const userRecord = this.userCommandCounts.get(userId);
    
    if (!userRecord) {
      return { allowed: true };
    }
    
    // Check if window has expired
    if (now > userRecord.resetTime) {
      this.userCommandCounts.delete(userId);
      return { allowed: true };
    }
    
    // Check if limit exceeded
    if (userRecord.count >= this.config.userLimits.commands) {
      const retryAfter = Math.ceil((userRecord.resetTime - now) / 1000);
      
      // If repeatedly hitting limit, temporarily ban
      if (userRecord.violations >= 3) {
        this.ipBans.add(userId);
        setTimeout(() => this.ipBans.delete(userId), this.config.userLimits.blockDurationMs);
        
        return {
          allowed: false,
          reason: 'Rate limit violated multiple times. Temporarily blocked for 5 minutes.',
          retryAfter: 300
        };
      }
      
      userRecord.violations = (userRecord.violations || 0) + 1;
      
      return {
        allowed: false,
        reason: `Rate limit exceeded. You can use ${this.config.userLimits.commands} commands per minute.`,
        retryAfter
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Check sensitive command limit
   */
  checkSensitiveLimit(userId, commandName, now) {
    const key = `${userId}:${commandName}`;
    const record = this.userCommandCounts.get(key);
    
    if (!record) {
      return { allowed: true };
    }
    
    if (now > record.resetTime) {
      this.userCommandCounts.delete(key);
      return { allowed: true };
    }
    
    if (record.count >= this.config.sensitiveLimits.commands) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      return {
        allowed: false,
        reason: `This sensitive command has a lower rate limit (${this.config.sensitiveLimits.commands} per 5 minutes).`,
        retryAfter
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Check global rate limit for command
   */
  checkGlobalLimit(commandName, now) {
    const globalRecord = this.globalCommandCounts.get(commandName);
    
    if (!globalRecord) {
      return { allowed: true };
    }
    
    if (now > globalRecord.resetTime) {
      this.globalCommandCounts.delete(commandName);
      return { allowed: true };
    }
    
    if (globalRecord.count >= this.config.globalLimits.commands) {
      const retryAfter = Math.ceil((globalRecord.resetTime - now) / 1000);
      return {
        allowed: false,
        reason: 'This command is experiencing high usage. Please try again later.',
        retryAfter
      };
    }
    
    return { allowed: true };
  }
  
  /**
   * Record command execution
   */
  recordExecution(userId, commandName, now) {
    // Record user command
    const userRecord = this.userCommandCounts.get(userId) || {
      count: 0,
      resetTime: now + this.config.userLimits.windowMs,
      violations: 0
    };
    userRecord.count++;
    this.userCommandCounts.set(userId, userRecord);
    
    // Record sensitive command
    if (this.isSensitiveCommand(commandName)) {
      const key = `${userId}:${commandName}`;
      const sensitiveRecord = this.userCommandCounts.get(key) || {
        count: 0,
        resetTime: now + this.config.sensitiveLimits.windowMs
      };
      sensitiveRecord.count++;
      this.userCommandCounts.set(key, sensitiveRecord);
    }
    
    // Record global command count
    const globalRecord = this.globalCommandCounts.get(commandName) || {
      count: 0,
      resetTime: now + this.config.globalLimits.windowMs
    };
    globalRecord.count++;
    this.globalCommandCounts.set(commandName, globalRecord);
  }
  
  /**
   * Check if command is sensitive
   */
  isSensitiveCommand(commandName) {
    const sensitiveCommands = [
      'add_case',
      'staffregister',
      'stafflist',
      'update_case_status',
      'background_check',
      'alt_account_detector',
      'disciplinary_scoring'
    ];
    return sensitiveCommands.includes(commandName);
  }
  
  /**
   * Cleanup expired records
   */
  startCleanup() {
    setInterval(() => {
      const now = Date.now();
      
      // Clean user records
      for (const [key, record] of this.userCommandCounts.entries()) {
        if (now > record.resetTime) {
          this.userCommandCounts.delete(key);
        }
      }
      
      // Clean global records
      for (const [key, record] of this.globalCommandCounts.entries()) {
        if (now > record.resetTime) {
          this.globalCommandCounts.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }
  
  /**
   * Manual ban/unban
   */
  banUser(userId, durationMs = 300000) {
    this.ipBans.add(userId);
    setTimeout(() => this.ipBans.delete(userId), durationMs);
  }
  
  unbanUser(userId) {
    this.ipBans.delete(userId);
  }
  
  /**
   * Get stats
   */
  getStats() {
    return {
      activeUsers: this.userCommandCounts.size,
      bannedUsers: this.ipBans.size,
      globalCommands: this.globalCommandCounts.size
    };
  }
}

module.exports = new RateLimiter();
