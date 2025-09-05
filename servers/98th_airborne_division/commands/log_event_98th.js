// eslint-disable-next-line no-unused-vars
require('dotenv').config();
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder, MessageFlags } = require('discord.js');
const { sheets, getCachedSheetData } = require('../../../utils/googleSheetsAuth');
const { getRowifi, interactionEmbed } = require('../../../functions');
const { logevent } = require('../../../permissions.json')["98th"]; // Assuming similar permission structure

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
    COOLDOWN: 1 * 60 * 1000 // 1 minute cooldown between requests
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
    const embed = createErrorEmbed(error);
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    } catch (err) {
        console.error("Failed to send error embed:", err);
    }
}

// Helper function to find the next available row in the sheet
async function findNextAvailableRow(spreadsheetId, sheetName, startRow = 2) {
    try {
        // Get the current data range - checking column A (Timestamp) from startRow to row 3500
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A${startRow}:A11000`
        });

        const values = response.data.values;

        // If no values are found, start at the specified row
        if (!values || values.length === 0) {
            console.log(`No values found in column A, returning startRow: ${startRow}`);
            return startRow;
        }

        // Iterate through the rows to find the first completely empty row in column A
        for (let i = 0; i < values.length; i++) {
            const cellValue = values[i]?.[0]?.trim();
            if (!cellValue) {
                console.log(`Found empty row at index ${i}, returning row: ${startRow + i}`);
                return startRow + i;
            }
        }

        // If all rows in the range are filled, return the next row after the last one
        console.log(`All rows in column A are filled, returning next row: ${startRow + values.length}`);
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

// Helper function to check if a row is already filled based on column A
async function isRowFilled(spreadsheetId, sheetName, rowNumber) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A${rowNumber}:A${rowNumber}`
        });

        const values = response.data.values;
        return values && values.length > 0 && values[0].some(cell => cell && cell.trim() !== '');
    } catch (error) {
        console.error(`Error checking if row ${rowNumber} is filled in column A:`, error);
        return false; // Assume not filled in case of error
    }
}

// Safe reply function to handle interaction replies consistently
async function safeReply(interaction, options) {
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(options);
        } else {
            await interaction.reply(options);
        }
    } catch (err) {
        console.error("Failed to send reply:", err);
    }
}

module.exports = {
    name: 'log_event_98th',
    description: 'Log an event for 98th, 120th, or 45th wing to the quota tracking spreadsheet',
    data: new SlashCommandBuilder()
        .setName('log_event_98th')
        .setDescription('Log an event for 98th, 120th, or 45th wing to the quota tracking spreadsheet')
        // Required options
        .addStringOption(option => 
            option.setName('attendee_names')
                .setDescription('Attendee usernames (space separated)')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('event_duration')
                .setDescription('Total time of the event (in minutes)')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('ending_screenshot')
                .setDescription('Link to ending screenshot/proof of the event')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('hosted_for')
                .setDescription('Who was this event hosted for?')
                .setRequired(true)
                .addChoices(
                    { name: '98th Airborne Division', value: '98th Airborne Division' },
                    { name: '45th Special Operations Wing', value: '45th Special Operations Wing' },
                    { name: '120th Elite Fighters Wing', value: '120th Elite Fighters Wing' },
                    { name: 'Training & Logistics Wing', value: 'Training & Logistics Wing' }
                ))
        // Optional wing-specific event types
        .addStringOption(option => 
            option.setName('event_type_98th')
                .setDescription('Type of 98th event (select only if logging 98th event)')
                .setRequired(false)
                .addChoices(
                    { name: 'Tryout/Recruitment Session', value: 'Tryout/Recruitment Session' },
                    { name: 'Patrol', value: 'Patrol' },
                    { name: 'Flight Training', value: 'Flight Training' },
                    { name: 'Assault Training', value: 'Assault Training' },
                    { name: 'Combat Training', value: 'Combat Training' },
                    { name: 'Combat Mission', value: 'Combat Mission' },
                    { name: 'Raid', value: 'Raid' },
                    { name: 'Misc/Special Event', value: 'Misc/Special Event' }
                ))
        .addStringOption(option => 
            option.setName('event_type_120th')
                .setDescription('Type of 120th event (select only if logging 120th event)')
                .setRequired(false)
                .addChoices(
                    { name: '120th Tryout', value: '120th Tryout' },
                    { name: 'Aerial Combat Session', value: 'Aerial Combat Session' },
                    { name: 'Aerial Bombing Training', value: 'Aerial Bombing Training' },
                    { name: 'Aerial Formations Training', value: 'Aerial Formations Training' },
                    { name: 'Simulations Training', value: 'Simulations Training' },
                    { name: '120th Scrim', value: '120th Scrim' },
                    { name: 'Evaluation', value: 'Evaluation' },
                    { name: '120th Patrol', value: '120th Patrol' }
                ))
        .addStringOption(option => 
            option.setName('event_type_45th')
                .setDescription('Type of 45th event (select only if logging 45th event)')
                .setRequired(false)
                .addChoices(
                    { name: '45th Tryout', value: '45th Tryout' },
                    { name: 'Paratrooper Training', value: 'Paratrooper Training' },
                    { name: 'Defense Training', value: 'Defense Training' },
                    { name: 'Aim Improvement Training', value: 'Aim Improvement Training' },
                    { name: '45th Patrol', value: '45th Patrol' },
                    { name: '45th Scrim', value: '45th Scrim' },
                    { name: 'Misc/Special Event', value: 'Misc/Special Event' }
                ))
        // Additional optional fields
        .addStringOption(option => 
            option.setName('co_host')
                .setDescription('Co-host username (optional)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('recruited_personnel')
                .setDescription('Recruited personnel (required only for tryout/recruitment events)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('notes')
                .setDescription('Additional notes (optional)')
                .setRequired(false)),

    /**
    * @param {Client} client
    * @param {CommandInteraction} interaction
    */
    run: async (client, interaction) => {
        
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Check permissions
            const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasRole) {
                await safeReply(interaction, {
                    content: '❌ Not proper permissions.',
                    flags: MessageFlags.Ephemeral
                });
                return;
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
            
            // Define spreadsheet details
            const SPREADSHEET_ID = '1HUdLwvOTZB8IggkST-P87y9ikX15zo1crFvg2sN0yNY';
            const SHEET_NAME = 'Events';

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
            
            // Get input values
            const hostUsername = rowifiResult.username;
            const coHost = interaction.options.getString('co_host') || '';
            const attendeeNames = interaction.options.getString('attendee_names');
            const eventDuration = interaction.options.getInteger('event_duration');
            const endingScreenshot = interaction.options.getString('ending_screenshot');
            const hostedFor = interaction.options.getString('hosted_for');
            const recruitedPersonnel = interaction.options.getString('recruited_personnel') || '';
            const notes = interaction.options.getString('notes') || '';
            
            // Get event type options
            const eventType98th = interaction.options.getString('event_type_98th');
            const eventType120th = interaction.options.getString('event_type_120th');
            const eventType45th = interaction.options.getString('event_type_45th');
            
            // Validation: Ensure exactly one event type is selected
            const eventTypes = [eventType98th, eventType120th, eventType45th].filter(Boolean);
            if (eventTypes.length === 0) {
                throw new LogQuotaError(
                    'No event type selected',
                    ERROR_CODES.VALIDATION_ERROR,
                    'Please select exactly one event type (98th, 120th, or 45th)'
                );
            }
            if (eventTypes.length > 1) {
                throw new LogQuotaError(
                    'Multiple event types selected',
                    ERROR_CODES.VALIDATION_ERROR,
                    'Please select only one event type (98th, 120th, or 45th)'
                );
            }
            
            // Determine the selected event type and value
            let selectedEventType, selectedEventValue;
            if (eventType98th) {
                selectedEventType = '98th';
                selectedEventValue = eventType98th;
            } else if (eventType120th) {
                selectedEventType = '120th';
                selectedEventValue = eventType120th;
            } else if (eventType45th) {
                selectedEventType = '45th';
                selectedEventValue = eventType45th;
            }
            
            // Validate recruited personnel requirement for tryout events
            const isTryoutEvent =
                (eventType98th && eventType98th === 'Tryout/Recruitment Session') ||
                (eventType120th && eventType120th === '120th Tryout') ||
                (eventType45th && eventType45th === '45th Tryout');

            if (isTryoutEvent && !recruitedPersonnel) {
                throw new LogQuotaError(
                    'Recruited personnel required for tryout events',
                    ERROR_CODES.VALIDATION_ERROR,
                    'Please specify the recruited personnel for tryout/recruitment events'
                );
            }
            
            // Validate the ending screenshot link
            if (!endingScreenshot || !endingScreenshot.startsWith('http')) {
                throw new LogQuotaError(
                    'Invalid ending screenshot link',
                    ERROR_CODES.VALIDATION_ERROR,
                    'Please provide a valid URL to an image as proof'
                );
            }
            
            // Create the timestamp
            const now = new Date();
            const formattedDate = now.toLocaleDateString('en-US', {
                month: '2-digit',
                day: '2-digit',
                year: 'numeric'
            });
            const formattedTime = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            const timestamp = `${formattedDate} ${formattedTime}`;
            
            // Create the row data based on CSV column routing:
            // Timestamp,Host,Co-Host,Attendee Names,98th Event,120th Event,45th Event,
            // Flight Investigations Unit Event,Event Duration,Hosted for?,Recruited Personnel,
            // Notes,Ending Screenshot,1 Verrus Points,3 Verrus Points,5 Verrus Points
            const rowData = [
                timestamp,                                          // A - Timestamp
                hostUsername,                                       // B - Host
                coHost,                                            // C - Co-Host
                attendeeNames,                                     // D - Attendee Names
                selectedEventType === '98th' ? selectedEventValue : '',   // E - 98th Event
                selectedEventType === '120th' ? selectedEventValue : '',  // F - 120th Event
                selectedEventType === '45th' ? selectedEventValue : '',   // G - 45th Event
                '',                                                // H - Flight Investigations Unit Event
                eventDuration.toString(),                          // I - Event Duration
                hostedFor,                                         // J - Hosted for?
                recruitedPersonnel,                                // K - Recruited Personnel
                notes,                                             // L - Notes
                endingScreenshot,                                  // M - Ending Screenshot
                '',                                                // N - 1 Verrus Points (to be filled later)
                '',                                                // O - 3 Verrus Points (to be filled later)          
                ''                                                 // P - 5 Verrus Points (to be filled later)
            ];
            
            try {
                await interaction.editReply({ 
                    content: `Finding proper row to insert your data...`
                });

                // Get the next available row
                let nextRow = await findNextAvailableRow(SPREADSHEET_ID, SHEET_NAME, 2);
                console.log(`Initial next available row found: ${nextRow}`);

                // Double-check that the row is actually empty
                let maxAttempts = 10;
                let attempts = 0;

                while (attempts < maxAttempts) {
                    const rowFilled = await isRowFilled(SPREADSHEET_ID, SHEET_NAME, nextRow);
                    if (!rowFilled) {
                        break;
                    }
                    console.log(`Row ${nextRow} is already filled in column A, trying next row`);
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

                // Write to the specific row
                const response = await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${SHEET_NAME}!A${nextRow}:P${nextRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [rowData]
                    }
                });

                console.log(`Successfully inserted data at row ${nextRow}:`, response.status);

                // Create confirmation embed
                const confirmEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(`✅ ${selectedEventType} Event Logged Successfully`)
                    .setDescription(`Your ${selectedEventValue} event has been recorded for quota tracking.`)
                    .addFields(
                        { name: 'Host', value: hostUsername, inline: true },
                        { name: 'Co-Host', value: coHost || 'None', inline: true },
                        { name: 'Event Type', value: `${selectedEventType}: ${selectedEventValue}`, inline: true },
                        { name: 'Duration (min)', value: eventDuration.toString(), inline: true },
                        { name: 'Attendees', value: attendeeNames, inline: false },
                        { name: 'Proof', value: `[View Screenshot](${endingScreenshot})`, inline: true },
                        { name: 'Hosted For', value: hostedFor, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'Your event will be reviewed by admin staff' });

                if (recruitedPersonnel) {
                    confirmEmbed.addFields({ name: 'Recruited Personnel', value: recruitedPersonnel, inline: true });
                }

                if (notes) {
                    confirmEmbed.addFields({ name: 'Notes', value: notes, inline: false });
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
                await handleError(interaction, new LogQuotaError(
                    'An unexpected error occurred',
                    ERROR_CODES.UNKNOWN_ERROR,
                    error.message
                ));
            }
        }
    }
};