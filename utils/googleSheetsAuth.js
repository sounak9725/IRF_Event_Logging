const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const { google } = require('googleapis');

const auth = new GoogleAuth({
  keyFile: path.join(__dirname, '../key_file.json'),  // Adjust the path as needed
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets'  
  ]
});

// Initialize Google Sheets client
const sheets = google.sheets({ version: 'v4', auth });

// Cache system for sheet data to reduce API calls
const dataCache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute cache TTL

/**
 * Helper for safer integer parsing
 * @param {any} value - Value to parse
 * @param {number} defaultValue - Default value if parsing fails
 * @returns {number} - Parsed integer or default value
 */
function parseIntOrDefault(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = parseInt(value);
  return isNaN(parsed) ? defaultValue : parseInt(value);
}

/**
 * Helper for safer float parsing
 * @param {any} value - Value to parse
 * @param {number} defaultValue - Default value if parsing fails
 * @returns {number} - Parsed float or default value
 */
function parseFloatOrDefault(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Fetches and caches spreadsheet data
 * @param {string} spreadsheetId - The ID of the spreadsheet
 * @param {string} range - The range to query
 * @returns {Promise<Array>} - Spreadsheet data rows
 */
async function getCachedSheetData(spreadsheetId, range) {
  const cacheKey = `${spreadsheetId}:${range}`;
  const cached = dataCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const data = response.data.values || [];
    dataCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    });
    
    return data;
  } catch (error) {
    console.error(`Error fetching sheet data (${spreadsheetId}, ${range}):`, error);
    if (error.response) {
      console.error('Response error details:', error.response.data);
    }
    throw new Error(`Failed to fetch spreadsheet data: ${error.message}`);
  }
}

/**
 * Clears the data cache
 */
function clearCache() {
  dataCache.clear();
  console.log('Sheet data cache cleared.');
}

module.exports = { 
  sheets,
  getCachedSheetData,
  parseIntOrDefault,
  parseFloatOrDefault,
  clearCache,
};