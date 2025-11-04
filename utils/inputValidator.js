/**
 * Input Validation and Sanitization Utility
 * Protects against injection attacks and malicious input
 */

class InputValidator {
  constructor() {
    // Regex patterns for validation
    this.patterns = {
      // Roblox username: 3-20 alphanumeric with underscores
      robloxUsername: /^[a-zA-Z0-9_]{3,20}$/,
      
      // Roblox user ID: numeric only
      robloxUserId: /^\d{1,15}$/,
      
      // Discord ID: 17-19 digits
      discordId: /^\d{17,19}$/,
      
      // Email: basic email validation
      email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      
      // URL: http/https only
      url: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)$/,
      
      // NoSQL injection patterns to block
      nosqlInjection: /(\$where|\$ne|\$gt|\$lt|\$gte|\$lte|\$in|\$nin|\$and|\$or|\$not|\$nor|\$exists|\$type|\$regex|\$text)/i,
      
      // XSS patterns to block
      xss: /<script|javascript:|onerror=|onload=|<iframe|eval\(|alert\(/i,
      
      // Path traversal
      pathTraversal: /\.\.|\/\.\.|\\\.\.|\.\.\\/,
      
      // Command injection
      commandInjection: /;|\||&&|`|\$\(|\)\{/
    };
    
    // Maximum lengths for various inputs
    this.maxLengths = {
      username: 20,
      email: 100,
      url: 2048,
      description: 2000,
      details: 4000,
      reason: 1000,
      notes: 2000
    };
  }
  
  /**
   * Validate Roblox username
   * @param {string} username - Username to validate
   * @returns {{ valid: boolean, error?: string, sanitized?: string }}
   */
  validateRobloxUsername(username) {
    if (!username || typeof username !== 'string') {
      return { valid: false, error: 'Username is required' };
    }
    
    // Trim whitespace
    const sanitized = username.trim();
    
    // Check length
    if (sanitized.length < 3 || sanitized.length > 20) {
      return { valid: false, error: 'Username must be 3-20 characters' };
    }
    
    // Check pattern
    if (!this.patterns.robloxUsername.test(sanitized)) {
      return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }
    
    // Check for injection attempts
    if (this.containsMaliciousPattern(sanitized)) {
      return { valid: false, error: 'Invalid characters detected' };
    }
    
    return { valid: true, sanitized };
  }
  
  /**
   * Validate Roblox user ID
   * @param {string|number} userId - User ID to validate
   * @returns {{ valid: boolean, error?: string, sanitized?: string }}
   */
  validateRobloxUserId(userId) {
    if (!userId) {
      return { valid: false, error: 'User ID is required' };
    }
    
    const sanitized = String(userId).trim();
    
    if (!this.patterns.robloxUserId.test(sanitized)) {
      return { valid: false, error: 'Invalid user ID format' };
    }
    
    return { valid: true, sanitized };
  }
  
  /**
   * Validate Discord ID
   * @param {string} discordId - Discord ID to validate
   * @returns {{ valid: boolean, error?: string, sanitized?: string }}
   */
  validateDiscordId(discordId) {
    if (!discordId) {
      return { valid: false, error: 'Discord ID is required' };
    }
    
    const sanitized = String(discordId).trim();
    
    if (!this.patterns.discordId.test(sanitized)) {
      return { valid: false, error: 'Invalid Discord ID format' };
    }
    
    return { valid: true, sanitized };
  }
  
  /**
   * Validate email address
   * @param {string} email - Email to validate
   * @returns {{ valid: boolean, error?: string, sanitized?: string }}
   */
  validateEmail(email) {
    if (!email || typeof email !== 'string') {
      return { valid: false, error: 'Email is required' };
    }
    
    const sanitized = email.trim().toLowerCase();
    
    if (sanitized.length > this.maxLengths.email) {
      return { valid: false, error: 'Email is too long' };
    }
    
    if (!this.patterns.email.test(sanitized)) {
      return { valid: false, error: 'Invalid email format' };
    }
    
    return { valid: true, sanitized };
  }
  
  /**
   * Validate URL
   * @param {string} url - URL to validate
   * @returns {{ valid: boolean, error?: string, sanitized?: string }}
   */
  validateUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'URL is required' };
    }
    
    const sanitized = url.trim();
    
    if (sanitized.length > this.maxLengths.url) {
      return { valid: false, error: 'URL is too long' };
    }
    
    if (!this.patterns.url.test(sanitized)) {
      return { valid: false, error: 'Invalid URL format. Must be http:// or https://' };
    }
    
    // Check for XSS in URL
    if (this.patterns.xss.test(sanitized)) {
      return { valid: false, error: 'URL contains potentially malicious content' };
    }
    
    // Validate allowed domains (optional whitelist)
    try {
      const urlObj = new URL(sanitized);
      const allowedDomains = [
        'docs.google.com',
        'drive.google.com',
        'roblox.com',
        'discord.com',
        'imgur.com',
        'gyazo.com'
      ];
      
      // Check if domain is in allowed list or subdomain
      const isAllowed = allowedDomains.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
      );
      
      if (!isAllowed) {
        console.warn(`[SECURITY] Non-whitelisted domain accessed: ${urlObj.hostname}`);
        // Don't block, but log for monitoring
      }
    } catch (e) {
      return { valid: false, error: 'Invalid URL' };
    }
    
    return { valid: true, sanitized };
  }
  
  /**
   * Validate text input (descriptions, details, etc.)
   * @param {string} text - Text to validate
   * @param {string} fieldName - Name of the field for error messages
   * @param {number} maxLength - Maximum allowed length
   * @returns {{ valid: boolean, error?: string, sanitized?: string }}
   */
  validateText(text, fieldName = 'Text', maxLength = 2000) {
    if (!text) {
      return { valid: true, sanitized: null }; // Allow empty for optional fields
    }
    
    if (typeof text !== 'string') {
      return { valid: false, error: `${fieldName} must be text` };
    }
    
    const sanitized = text.trim();
    
    if (sanitized.length > maxLength) {
      return { valid: false, error: `${fieldName} is too long (max ${maxLength} characters)` };
    }
    
    // Check for malicious patterns
    if (this.containsMaliciousPattern(sanitized)) {
      return { valid: false, error: `${fieldName} contains invalid or potentially malicious content` };
    }
    
    return { valid: true, sanitized };
  }
  
  /**
   * Check for malicious patterns (NoSQL injection, XSS, etc.)
   * @param {string} input - Input to check
   * @returns {boolean} - True if malicious pattern found
   */
  containsMaliciousPattern(input) {
    if (!input || typeof input !== 'string') return false;
    
    return (
      this.patterns.nosqlInjection.test(input) ||
      this.patterns.xss.test(input) ||
      this.patterns.pathTraversal.test(input) ||
      this.patterns.commandInjection.test(input)
    );
  }
  
  /**
   * Sanitize MongoDB query to prevent injection
   * @param {Object} query - MongoDB query object
   * @returns {Object} - Sanitized query
   */
  sanitizeMongoQuery(query) {
    if (!query || typeof query !== 'object') return query;
    
    const sanitized = {};
    
    for (const [key, value] of Object.entries(query)) {
      // Block keys starting with $
      if (key.startsWith('$')) {
        console.warn(`[SECURITY] Blocked query with $ operator: ${key}`);
        continue;
      }
      
      // Recursively sanitize nested objects
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = this.sanitizeMongoQuery(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'object' ? this.sanitizeMongoQuery(item) : item
        );
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }
  
  /**
   * Validate multiple fields at once
   * @param {Object} fields - Object with field names and values
   * @param {Object} rules - Validation rules for each field
   * @returns {{ valid: boolean, errors: Object, sanitized: Object }}
   */
  validateMultiple(fields, rules) {
    const errors = {};
    const sanitized = {};
    let valid = true;
    
    for (const [fieldName, value] of Object.entries(fields)) {
      const rule = rules[fieldName];
      if (!rule) continue;
      
      let result;
      
      switch (rule.type) {
        case 'robloxUsername':
          result = this.validateRobloxUsername(value);
          break;
        case 'robloxUserId':
          result = this.validateRobloxUserId(value);
          break;
        case 'discordId':
          result = this.validateDiscordId(value);
          break;
        case 'email':
          result = this.validateEmail(value);
          break;
        case 'url':
          result = this.validateUrl(value);
          break;
        case 'text':
          result = this.validateText(value, fieldName, rule.maxLength);
          break;
        default:
          continue;
      }
      
      if (!result.valid) {
        errors[fieldName] = result.error;
        valid = false;
      } else {
        sanitized[fieldName] = result.sanitized;
      }
    }
    
    return { valid, errors, sanitized };
  }
  
  /**
   * Escape Discord markdown to prevent formatting abuse
   * @param {string} text - Text to escape
   * @returns {string} - Escaped text
   */
  escapeMarkdown(text) {
    if (!text || typeof text !== 'string') return text;
    
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/\|/g, '\\|');
  }
}

module.exports = new InputValidator();
