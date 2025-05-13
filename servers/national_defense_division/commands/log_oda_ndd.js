// eslint-disable-next-line no-unused-vars
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder, MessageFlags } = require('discord.js');
const { sheets, getCachedSheetData } = require('../../../utils/googleSheetsAuth');
const { getRowifi } = require('../../../functions');
const config = require('../../../config.json');

// Custom error class for better error handling
class LogQuotaError extends Error {
    constructor(message, code, details = null) {
        super(message);
        this.name = 'LogQuotaError';
        this.code = code;
        this.details = details;
    }
}

// Error codes for different types of errors
const ERROR_CODES = {
    PERMISSION_DENIED: 'ERR-UPRM',
    ROWIFI_ERROR: 'ERR-ROWIFI',
    VALIDATION_ERROR: 'ERR-VALIDATION',
    SHEETS_ERROR: 'ERR-SHEETS',
    UNKNOWN_ERROR: 'ERR-UNKNOWN',
    RATE_LIMIT: 'ERR-RATELIMIT'
};

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
    WINDOW: 60 * 60 * 1000, // 1 hour window
    MAX_REQUESTS: 10, // Maximum requests per window
    COOLDOWN: 0.5 * 60 * 1000 // 5 minutes cooldown between requests
};

// Store user request timestamps
const userRequestsMap = new Map();

// Helper function to check rate limits
function checkRateLimit(userId) {
    const now = Date.now();
    const userRequests = userRequestsMap.get(userId) || [];
    
    // Clean up old requests
    const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_CONFIG.WINDOW);
    
    // Check if user has exceeded rate limit
    if (recentRequests.length >= RATE_LIMIT_CONFIG.MAX_REQUESTS) {
        const oldestRequest = recentRequests[0];
        const timeLeft = Math.ceil((RATE_LIMIT_CONFIG.WINDOW - (now - oldestRequest)) / 1000 / 60);
        return {
            allowed: false,
            timeLeft: timeLeft,
            isCooldown: false
        };
    }
    
    // Check cooldown
    if (recentRequests.length > 0) {
        const lastRequest = recentRequests[recentRequests.length - 1];
        const timeSinceLastRequest = now - lastRequest;
        if (timeSinceLastRequest < RATE_LIMIT_CONFIG.COOLDOWN) {
            const timeLeft = Math.ceil((RATE_LIMIT_CONFIG.COOLDOWN - timeSinceLastRequest) / 1000);
            return {
                allowed: false,
                timeLeft: timeLeft,
                isCooldown: true
            };
        }
    }
    
    // Update user requests
    recentRequests.push(now);
    userRequestsMap.set(userId, recentRequests);
    
    return { allowed: true };
}

// Helper function to create error embeds
function createErrorEmbed(error) {
    const embed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Error')
        .setDescription(error.message);

    if (error.details) {
        embed.addFields({ name: 'Details', value: error.details });
    }

    return embed;
}

// Helper function to handle errors consistently
async function handleError(interaction, error) {
    console.error(`[${error.code || ERROR_CODES.UNKNOWN_ERROR}] ${error.message}`, error);

    const embed = createErrorEmbed(error);
    
    if (interaction.deferred) {
        await interaction.editReply({ embeds: [embed], ephemeral: true }).catch(console.error);
    } else {
        await interaction.reply({ embeds: [embed], ephemeral: true }).catch(console.error);
    }
}

// Fixed helper function to find the next available row in the sheet
async function findNextAvailableRow(spreadsheetId, sheetName, startRow = 2) {
    try {
        // Get the current data range - checking a larger range to ensure we don't miss any rows
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A${startRow}:A5000` // Check from startRow up to row 5000
        });
        
        const values = response.data.values;
        
        // If no values found, start at the specified row
        if (!values || values.length === 0) {
            console.log(`No values found, returning startRow: ${startRow}`);
            return startRow;
        }
        
        // Find the first empty row by checking for empty cells in column A
        for (let i = 0; i < values.length; i++) {
            if (!values[i] || values[i].length === 0 || !values[i][0] || values[i][0].trim() === '') {
                console.log(`Found empty row at index ${i}, returning row: ${startRow + i}`);
                return startRow + i;
            }
        }
        
        // If all rows have data, return the next row after the last one
        console.log(`All rows have data, returning next row: ${startRow + values.length}`);
        return startRow + values.length;
    } catch (error) {
        console.error('Error finding next available row:', error);
        throw new LogQuotaError(
            'Failed to find next available row',
            ERROR_CODES.SHEETS_ERROR,
            error.message
        );
    }
}

// Helper function to check if a row is already filled
async function isRowFilled(spreadsheetId, sheetName, rowNumber) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A${rowNumber}:C${rowNumber}`
        });
        
        const values = response.data.values;
        return values && values.length > 0 && values[0].some(cell => cell && cell.trim() !== '');
    } catch (error) {
        console.error(`Error checking if row ${rowNumber} is filled:`, error);
        return false; // Assume not filled in case of error
    }
}

module.exports = {
    name: 'log_oda_ndd',
    description: 'Log an discpline stuff to the quota tracking spreadsheet',
    data: new SlashCommandBuilder()
    .setName('log_oda_ndd')
    .setDescription('Log an IA-related event to the activity sheet')
    .addStringOption(option =>
        option.setName('ia_rank')
            .setDescription('Your IA Rank')
            .setRequired(true)
            .addChoices(
                { name: 'Junior Detective (Candidate)', value: 'Junior Detective (Candidate)' },
                { name: 'Detective', value: 'Detective' },
                { name: 'Senior Detective', value: 'Senior Detective' },
                { name: 'Command (1ic & 2ic)', value: 'Command (1ic & 2ic)' }
            ))
    .addStringOption(option =>
        option.setName('activity')
            .setDescription('What activity are you logging?')
            .setRequired(true)
            .addChoices(
                { name: 'Personnel Report', value: 'Personnel Report' },
                { name: 'Case File', value: 'Case File' },
                { name: 'Training Report', value: 'Training Report' },
                { name: 'Discord Moderation', value: 'Discord Moderation' },
                { name: 'Enhancement Training', value: 'Enhancement Training' },
                { name: 'Security Check', value: 'Security Check' },
                { name: 'Candidate Event Supervision (Senior Detective+)', value: 'Candidate Event Supervision (Senior Detective+)' }
            ))
    .addStringOption(option =>
        option.setName('proof')
            .setDescription('URL to image or evidence')
            .setRequired(true))
    .addStringOption(option =>
        option.setName('notes')
            .setDescription('Optional notes (write N/A if none)')
            .setRequired(true)),


    /**
    * @param {Client} client
    * @param {CommandInteraction} interaction
    */
    run: async (client, interaction) => {
        try {
            // Check rate limits
            const rateLimitCheck = checkRateLimit(interaction.user.id);
            if (!rateLimitCheck.allowed) {
                const timeUnit = rateLimitCheck.isCooldown ? 'seconds' : 'minutes';
                throw new LogQuotaError(
                    'You are being rate limited.',
                    ERROR_CODES.RATE_LIMIT,
                    `Please wait ${rateLimitCheck.timeLeft} ${timeUnit} before trying again.`
                );
            }
            
            // Define your spreadsheet ID
            const SPREADSHEET_ID = '1HFjg2i0KiH956mdFRaoVzCNUAI5XaiNhIdh0i2bZ_fc';
            const SHEET_NAME = 'Sheet5';

            await interaction.deferReply({ ephemeral: true });
            
            // Get Roblox username from Rowifi
            const discordId = interaction.user.id;
            const rowifiResult = await getRowifi(discordId, client);
            
            if (!rowifiResult.success) {
                throw new LogQuotaError(
                    'Unable to fetch your Roblox username from RoWifi.',
                    ERROR_CODES.ROWIFI_ERROR,
                    `Please ensure you are verified with RoWifi. (${rowifiResult.error})`
                );
            }
            
            const robloxUsername = rowifiResult.username;
            const discordUsername = interaction.user.username;
            const iaRank = interaction.options.getString('ia_rank');
            const activity = interaction.options.getString('activity');
            const proof = interaction.options.getString('proof');
            const notes = interaction.options.getString('notes');;
            
            // Validate the proof link
            if (!proof || !proof.startsWith('http')) {
                throw new LogQuotaError(
                    'Invalid proof link',
                    ERROR_CODES.VALIDATION_ERROR,
                    'Please provide a valid URL to an image as proof'
                );
            }
            
            // Create the row data based on column routing
            const now = new Date();
            const formattedDate = now.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: '2-digit', 
                year: 'numeric'
            });
            const formattedTime = now.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            const timestamp = `${formattedDate} ${formattedTime}`;
            
            
            // Create array with empty values for columns A and B which appear to be admin-managed
            const rowData = [
             timestamp,          // A: Timestamp
            robloxUsername,     // B: Roblox Username
             discordUsername,    // C: Discord Username
            iaRank,             // D: IA Rank
             activity,           // E: Activity
             proof,              // F: Proof
            notes               // G: Notes
            ];
            
            try {
                await interaction.editReply({ 
                    content: `Finding proper row to insert your data...`
                });

                // Get the next available row
                let nextRow = await findNextAvailableRow(SPREADSHEET_ID, SHEET_NAME, 2);
                console.log(`Initial next available row found: ${nextRow}`);
                
                // Double-check that the row is actually empty
                let maxAttempts = 5;
                let attempts = 0;
                
                while (attempts < maxAttempts) {
                    const rowFilled = await isRowFilled(SPREADSHEET_ID, SHEET_NAME, nextRow);
                    if (!rowFilled) {
                        break; // Row is empty, we can use it
                    }
                    
                    console.log(`Row ${nextRow} is already filled, trying next row`);
                    nextRow++;
                    attempts++;
                }
                
                if (attempts >= maxAttempts) {
                    console.log(`Warning: Couldn't find an empty row after ${maxAttempts} attempts`);
                }
                
                console.log(`Using row ${nextRow} for data insertion`);

                // Write directly to the specific row
                const response = await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${SHEET_NAME}!A${nextRow}:G${nextRow}`, // Writing A to G
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [rowData]
                    }
                });
                
                console.log(`Successfully inserted data at row ${nextRow}:`, response.status);
                
                // Create confirmation embed
                const confirmEmbed = new EmbedBuilder()
                 .setColor('#00FF00')
                 .setTitle('✅ Event Submitted Successfully')
                 .setDescription('Your IA log has been submitted successfully.')
                  .addFields(
                   { name: 'Roblox Username', value: robloxUsername, inline: true },
                   { name: 'Discord Username', value: discordUsername, inline: true },
                   { name: 'IA Rank', value: iaRank, inline: true },
                   { name: 'Activity', value: activity, inline: true },
                   { name: 'Proof', value: `[View Proof](${proof})`, inline: false },
                   { name: 'Notes', value: notes || 'N/A', inline: false }
                  )
                .setTimestamp()
                 .setFooter({ text: 'This log is now recorded in the IA sheet.' });

                await interaction.editReply({ content: '', embeds: [confirmEmbed] });

                
            } catch (sheetError) {
                console.error('Error when trying to write to sheet:', sheetError);
                let errorMessage = "Failed to log event to Google Sheets.";
                let errorDetails = sheetError.message;

                if (sheetError.status === 503) {
                    errorMessage = "Google Sheets service is currently unavailable.";
                    errorDetails = "Please try again in a few minutes.";
                } else if (sheetError.status === 401 || sheetError.status === 403) {
                    errorMessage = "Authorization error with Google Sheets.";
                    errorDetails = "Please notify an administrator.";
                } else if (sheetError.status === 404) {
                    errorMessage = "The spreadsheet could not be found.";
                    errorDetails = "Please notify an administrator.";
                }

                throw new LogQuotaError(
                    errorMessage,
                    ERROR_CODES.SHEETS_ERROR,
                    errorDetails
                );
            }
            
        } catch (error) {
            if (error instanceof LogQuotaError) {
                await handleError(interaction, error);
            } else {
                // Handle unexpected errors
                await handleError(interaction, new LogQuotaError(
                    'An unexpected error occurred',
                    ERROR_CODES.UNKNOWN_ERROR,
                    error.message
                ));
            }
        }
    }
};