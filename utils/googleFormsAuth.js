const { GoogleAuth } = require('google-auth-library');
const path = require('path');
const { google } = require('googleapis');

const auth = new GoogleAuth({
  keyFile: path.join(__dirname, '../key_file.json'),  // Adjust the path as needed
  scopes: [
    'https://www.googleapis.com/auth/forms.body'    // For Google Forms
  ]
});

// Initialize Google Sheets and Forms clients
const forms = google.forms({ version: 'v1', auth });

module.exports = { forms };