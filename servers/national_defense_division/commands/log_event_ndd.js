// eslint-disable-next-line no-unused-vars
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder, MessageFlags } = require('discord.js');
const { sheets, getCachedSheetData } = require('../../../utils/googleSheetsAuth');
const { getRowifi, interactionEmbed } = require('../../../functions');
const config = require('../../../config.json');
const { logevent } = require('../../../permissions.json').ndd;

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
    COOLDOWN: 1 * 60 * 1000 // 5 minutes cooldown between requests
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
        // Get the current data range - checking column C from startRow to row 3500
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!C${startRow}:C3500` // Check column C
        });

        const values = response.data.values;

        // If no values are found, start at the specified row
        if (!values || values.length === 0) {
            console.log(`No values found in column C, returning startRow: ${startRow}`);
            return startRow;
        }

        // Iterate through the rows to find the first completely empty row in column C
        for (let i = 0; i < values.length; i++) {
            const cellValue = values[i]?.[0]?.trim();
            if (!cellValue) {
                console.log(`Found empty row at index ${i}, returning row: ${startRow + i}`);
                return startRow + i;
            }
        }

        // If all rows in the range are filled, return the next row after the last one
        console.log(`All rows in column C are filled, returning next row: ${startRow + values.length}`);
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

// Helper function to check if a row is already filled based on column C
async function isRowFilled(spreadsheetId, sheetName, rowNumber) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!C${rowNumber}:C${rowNumber}` // Check column C for the specific row
        });

        const values = response.data.values;
        return values && values.length > 0 && values[0].some(cell => cell && cell.trim() !== '');
    } catch (error) {
        console.error(`Error checking if row ${rowNumber} is filled in column C:`, error);
        return false; // Assume not filled in case of error
    }
}

module.exports = {
    name: 'log_event_ndd',
    description: 'Log an event to the quota tracking spreadsheet',
    data: new SlashCommandBuilder()
        .setName('log_event_ndd')
        .setDescription('Log an event to the quota tracking spreadsheet')
        .addStringOption(option => 
            option.setName('event_type')
                .setDescription('Type of event you hosted')
                .setRequired(true)
                .addChoices(
                    { name: 'ND Inspection/Meeting', value: 'ND Inspection/Meeting' },
                    { name: 'Border Simulation', value: 'Border Simulation' },
                    { name: 'Protocol', value: 'Protocol' },
                    { name: 'Combat Training', value: 'Combat Training' },
                    { name: 'Defense Training', value: 'Defense Training' },
                    { name: 'Enhancement Training', value: 'Enhancement Training' },
                    { name: 'Medical Training', value: 'Medical Training' },
                    { name: 'Patrol', value: 'Patrol' },
                    { name: 'Recruitment Session', value: 'Recruitment Session' },
                    { name: 'Tryout', value: 'Tryout' },
                    { name: 'Defensive Raid', value: 'Defensive Raid' },
                    { name: 'Gamenight', value: 'Gamenight' }
                ))
        .addStringOption(option => 
            option.setName('event_scope')
                .setDescription('Is this a Divisional-Wide or Unit Event?')
                .setRequired(true)
                .addChoices(
                    { name: 'Divisional-Wide', value: 'Divisional-Wide' },
                    { name: '27th Medical Corps', value: '27th Medical Corps' }
                ))
        .addStringOption(option => 
            option.setName('co_hosts')
                .setDescription('Usernames of co-hosts (comma separated, leave empty if none)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('attendees')
                .setDescription('Attendees usernames and DPs awarded (format: username:DP, username:DP)')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('attendee_count')
                .setDescription('Number of attendees at your event')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('proof')
                .setDescription('Link to image/screenshot of the event')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('event_duration')
                .setDescription('Total time of the event (in minutes)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('notes')
                .setDescription('Notes for AU (optional)')
                .setRequired(true))
        .addBooleanOption(option => 
            option.setName('double_quota')
                .setDescription('Is this a double quota event?')
                .setRequired(true)),

    /**
    * @param {Client} client
    * @param {CommandInteraction} interaction
    */
    run: async (client, interaction) => {
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        
        try {

              const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasRole) {
             return interactionEmbed(3, "[ERR-UPRM]", 'Not proper permissions', interaction, client, [true, 30]);
             }
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
            const SPREADSHEET_ID = '1CaDDWYTmwYbnOEAURm2eAUrHRAaGSkZpH3R5RLFBEFo';
            const SHEET_NAME = 'NDD Quota Form';

            
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
            
            // Get input values from the command
            const robloxUsername = rowifiResult.username;
            const discordUsername = interaction.user.username;
            const eventScope = interaction.options.getString('event_scope');
            const eventType = interaction.options.getString('event_type');
            const coHosts = interaction.options.getString('co_hosts') || '';
            const attendees = interaction.options.getString('attendees');
            const attendeeCount = interaction.options.getInteger('attendee_count');
            const proof = interaction.options.getString('proof');
            const eventDuration = interaction.options.getInteger('event_duration');
            const notes = interaction.options.getString('notes') || '';
            const password = "HARDCODE"; // Placeholder for password
            const doubleQuota = interaction.options.getBoolean('double_quota');
            
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
            
            // Based on your column routing:
            // C:Timestamp D:Roblox Username E:Discord Username F:Divisional-Wide or Unit Event?
            // G:Event Type H:Co-hosts I:Attendees J:Attendee Count K:Proof L:Duration
            // M:Notes N:Password O:Double Quota
            
            // Create array with empty values for columns A and B which appear to be admin-managed
            const rowData = [
                '',                      // A - Empty or admin managed
                '',                      // B - Empty or admin managed  
                timestamp,               // C - Timestamp
                robloxUsername,          // D - Roblox Username
                discordUsername,         // E - Discord Username
                eventScope,              // F - Divisional-Wide or Unit Event?
                eventType,               // G - Event Type
                coHosts,                 // H - Co-hosts Username
                attendees,               // I - Attendees usernames and DPs awarded
                attendeeCount.toString(),// J - Number of attendees
                proof,                   // K - Proof link
                eventDuration.toString(),// L - Total time (minutes)
                notes,                   // M - Notes for AU
                password,                // N - Individual password
                doubleQuota ? 'Yes' : 'No'// O - Double Quota?
            ];
            
            try {
                await interaction.editReply({ 
                    content: `Finding proper row to insert your data...`
                });

                // Get the next available row based on column C
                let nextRow = await findNextAvailableRow(SPREADSHEET_ID, SHEET_NAME, 2);
                console.log(`Initial next available row found: ${nextRow}`);

                // Double-check that the row is actually empty in column C
                let maxAttempts = 10; // Increase the number of attempts to ensure we find an empty row
                let attempts = 0;

                while (attempts < maxAttempts) {
                    const rowFilled = await isRowFilled(SPREADSHEET_ID, SHEET_NAME, nextRow);
                    if (!rowFilled) {
                        break; // Row is empty in column C, we can use it
                    }

                    console.log(`Row ${nextRow} is already filled in column C, trying next row`);
                    nextRow++;
                    attempts++;
                }

                if (attempts >= maxAttempts) {
                    throw new LogQuotaError(
                        'Could not find an empty row after multiple attempts.',
                        ERROR_CODES.SHEETS_ERROR,
                        'Please check the spreadsheet for available rows or contact an administrator.'
                    );
                }

                console.log(`Using row ${nextRow} for data insertion`);

                // Write directly to the specific row
                const response = await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${SHEET_NAME}!A${nextRow}:O${nextRow}`,
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
                    .setDescription(`Your ${eventType} event has been recorded for quota tracking.`)
                    .addFields(
                        { name: 'Host', value: robloxUsername, inline: true },
                        { name: 'Discord Username', value: discordUsername, inline: true },
                        { name: 'Event Scope', value: eventScope, inline: true },
                        { name: 'Event Type', value: eventType, inline: true },
                        { name: 'Co-Hosts', value: coHosts || 'None', inline: true },
                        { name: 'Attendee Count', value: attendeeCount.toString(), inline: true },
                        { name: 'Duration (min)', value: eventDuration.toString(), inline: true },
                        { name: 'Double Quota', value: doubleQuota ? 'Yes' : 'No', inline: true },
                        { name: 'Proof', value: `[View Image](${proof})`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Your event will be reviewed by admin staff' });

                if (notes) {
                    confirmEmbed.addFields({ name: 'Notes for AU', value: notes, inline: false });
                }

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