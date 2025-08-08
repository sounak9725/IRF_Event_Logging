const { SlashCommandBuilder, EmbedBuilder, MessageFlags, Client, CommandInteractionOptionResolver } = require('discord.js');
const { sheets } = require('../../../utils/googleSheetsAuth');
const { getRowifi, interactionEmbed } = require('../../../functions');
const { logevent } = require('../../../permissions.json').ga;


// Custom error class for better error handling
class LogActivityError extends Error {
    constructor(message, code, details = null) {
        super(message);
        this.name = 'LogActivityError';
        this.code = code;
        this.details = details;
    }
}

// Error codes
const ERROR_CODES = {
    PERMISSION_DENIED: 'ERR-UPRM',
    ROWIFI_ERROR: 'ERR-ROWIFI',
    VALIDATION_ERROR: 'ERR-VALIDATION',
    SHEETS_ERROR: 'ERR-SHEETS',
    UNKNOWN_ERROR: 'ERR-UNKNOWN'
};

// Spreadsheet configuration
const SPREADSHEET_ID = '1Z1GBJN4pH_-9hMeuZZx0xohvZX-o7gipym-Wx3QCC2Y';
const SHEET_NAME = 'Activity Submissions';
const START_ROW = 438; // Starting from row 2
const START_COLUMN = 'C'; // Starting from column C (Timestamp)

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

// Helper function to find the next available row in column C
async function findNextAvailableRow() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!${START_COLUMN}${START_ROW}:${START_COLUMN}10000`
        });

        const values = response.data.values || [];
        
        for (let i = 0; i < values.length; i++) {
            if (!values[i] || values[i][0] === undefined || values[i][0].trim() === '') {
                return START_ROW + i;
            }
        }
        
        return START_ROW + values.length;
    } catch (error) {
        console.error('Error finding next available row:', error);
        throw new LogActivityError(
            'Failed to find next available row',
            ERROR_CODES.SHEETS_ERROR,
            error.message
        );
    }
}

// Helper function to format the timestamp as DD/MM/YYYY HH:mm:ss
function formatTimestamp(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are 0-based
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

module.exports = {
    name: 'log_activity_ga',
    description: 'Log an activity to the tracking spreadsheet',
    data: new SlashCommandBuilder()
        .setName('log_activity_ga')
        .setDescription('Log an activity to the tracking spreadsheet')
        .addStringOption(option => 
            option.setName('event_type')
                .setDescription('Select the event type')
                .setRequired(true)
                .addChoices(
                    { name: 'Self Patrol', value: 'Self Patrol' },
                    { name: 'GA Patrol', value: 'GA Patrol' },
                    { name: 'Border Simulation Exercise', value: 'Border Simulation Exercise' },
                    { name: 'Rapid Response', value: 'Rapid Response' },
                    { name: 'Reports', value: 'Reports' },
                    { name: 'Shadow', value: 'Shadow' },
                    { name: 'Supervision', value: 'Supervision' },
                    { name: 'Recruitment Session', value: 'Recruitment Session' }
                ))
        // Common optional fields
        .addStringOption(option => 
            option.setName('start_time')
                .setDescription('Start time (HH:MM format)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('end_time')
                .setDescription('End time (HH:MM format)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('attendees')
                .setDescription('Attendees (comma-separated)')
                .setRequired(false))
        .addIntegerOption(option => 
            option.setName('report_count')
                .setDescription('Number of rapid responses or reports')
                .setRequired(false))
        .addIntegerOption(option => 
            option.setName('passers')
                .setDescription('Applicants that passed the Recruitment Session')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('evaluated_user')
                .setDescription('Evaluated username (for Shadow/Supervision)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('supervision_type')
                .setDescription('Type of supervision (for Shadow/Supervision)')
                .setRequired(false)
                .addChoices(
                    { name: 'Shadow', value: 'Shadow' },
                    { name: 'Trial Administrator Supervision', value: 'Trial Administrator Supervision' },
                    { name: 'Undercover Evaluation (ADMIN COMMAND)', value: 'Undercover Evaluation (ADMIN COMMAND)' },
                    { name: 'NCO Event Evaluation (Supervisory Moderation+): Patrol', value: 'NCO Event Evaluation (Supervisory Moderation+): Patrol' },
                    { name: 'NCO Event Evaluation (Supervisory Moderation+): BSE', value: 'NCO Event Evaluation (Supervisory Moderation+): BSE' }
                ))
        .addBooleanOption(option => 
            option.setName('passed_eval')
                .setDescription('Did they pass? (for evaluations)')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('start_proof')
                .setDescription('URL to starting proof')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('end_proof')
                .setDescription('URL to ending proof')
                .setRequired(false))
        .addStringOption(option => 
            option.setName('notes')
                .setDescription('Additional notes')
                .setRequired(false)),
     /**
    * @param {Client} client
    * @param {CommandInteraction} interaction
    */      
     run: async(client, interaction) => {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if the user has the required role
             const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasRole) {
             return interactionEmbed(3, "[ERR-UPRM]", 'Not proper permissions', interaction, client, [true, 30]);
             }
             const rowifi = await getRowifi(interaction.user.id, client);
            if (!rowifi.success) throw new LogActivityError('Unable to fetch your Roblox username.', ERROR_CODES.ROWIFI_ERROR, rowifi.error);
            
            // Get all input values
            const username = rowifi.username;
            const eventType = interaction.options.getString('event_type');
            const startTime = interaction.options.getString('start_time') || '';
            const endTime = interaction.options.getString('end_time') || '';
            const attendees = interaction.options.getString('attendees') || '';
            const reportCount = interaction.options.getInteger('report_count') || '';
            const passers = interaction.options.getInteger('passers') || '';
            const evaluatedUser = interaction.options.getString('evaluated_user') || '';
            const supervisionType = interaction.options.getString('supervision_type') || '';
            const passedEval = interaction.options.getBoolean('passed_eval');
            const startProof = interaction.options.getString('start_proof') || '';
            const endProof = interaction.options.getString('end_proof') || '';
            const notes = interaction.options.getString('notes') || '';

            // Create timestamp in DD/MM/YYYY HH:mm:ss format
            const timestamp = formatTimestamp(new Date());

            // Validate required fields based on event type
            if (eventType === 'Self Patrol' || eventType === 'GA Patrol' || eventType === 'Border Simulation Exercise') {
                if (!startTime || !endTime) {
                    throw new LogActivityError(
                        'Start and end times are required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please provide both start and end times for this event type'
                    );
                }
                if (!startProof) {
                    throw new LogActivityError(
                        'Starting proof is required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please provide a URL to the starting proof'
                    );
                }
            }

            if (eventType === 'GA Patrol' || eventType === 'Border Simulation Exercise') {
                if (!attendees) {
                    throw new LogActivityError(
                        'Attendees are required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please provide a list of attendees for this event type'
                    );
                }
            }

            if (eventType === 'Rapid Response' || eventType === 'Reports') {
                if (!reportCount) {
                    throw new LogActivityError(
                        'Report count is required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please provide the number of rapid responses or reports'
                    );
                }
                if (!startProof) {
                    throw new LogActivityError(
                        'Proof is required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please provide a URL to the proof'
                    );
                }
            }

            if (eventType === 'Shadow' || eventType === 'Supervision') {
                if (!evaluatedUser) {
                    throw new LogActivityError(
                        'Evaluated user is required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please specify who you evaluated'
                    );
                }
                if (!supervisionType) {
                    throw new LogActivityError(
                        'Supervision type is required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please select a supervision type'
                    );
                }
                if (!startProof) {
                    throw new LogActivityError(
                        'Proof is required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please provide a URL to the proof'
                    );
                }
            }

            if (eventType === 'Recruitment Session') {
                if (!passers) {
                    throw new LogActivityError(
                        'Number of passers is required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please specify how many applicants passed'
                    );
                }
                if (!attendees) {
                    throw new LogActivityError(
                        'Attendees are required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please provide a list of attendees for the recruitment session'
                    );
                }
                if (!startProof || !endProof) {
                    throw new LogActivityError(
                        'Both start and end proofs are required',
                        ERROR_CODES.VALIDATION_ERROR,
                        'Please provide URLs to both start and end proofs'
                    );
                }
            }

            // Prepare row data starting from column C (Timestamp)
            const rowData = [
                timestamp,                                      // C - Timestamp
                username,                                       // D - Roblox's Username
                eventType,                                      // E - Activity to Log
                startTime,                                      // F - Starting Time
                endTime,                                        // G - Ending Time
                attendees,                                     // H - Attendees
                reportCount,                                    // I - Amount of rapid responses/reports
                passers,                                        // J - Applicants that passed
                evaluatedUser,                                  // K - Evaluated username
                supervisionType,                               // L - Supervision done
                passedEval ? 'Yes' : (passedEval === false ? 'No' : ''), // M - Did they pass?
                startProof,                                    // N - Starting Proof
                endProof,                                       // O - Ending Proof
                notes                                           // P - Notes
            ];

            // Find the next available row
            const nextRow = await findNextAvailableRow();
            console.log(`Next available row: ${nextRow}`);
            console.log('Row data to be written:', rowData); // Debug log

            // Write to the sheet (columns C to P)
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!C${nextRow}:P${nextRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Activity Logged Successfully')
                .setDescription(`Your ${eventType} activity has been recorded.`)
                .addFields(
                    { name: 'Username', value: username, inline: true },
                    { name: 'Event Type', value: eventType, inline: true },
                    { name: 'Timestamp', value: timestamp, inline: true }
                );

            // Add additional fields based on event type
            if (startTime && endTime) {
                successEmbed.addFields(
                    { name: 'Start Time', value: startTime, inline: true },
                    { name: 'End Time', value: endTime, inline: true }
                );
            }

            if (attendees) {
                successEmbed.addFields({ name: 'Attendees', value: attendees, inline: false });
            }

            if (eventType === 'Rapid Response' || eventType === 'Reports') {
                successEmbed.addFields({ name: 'Count', value: reportCount.toString(), inline: true });
            }

            if (eventType === 'Recruitment Session') {
                successEmbed.addFields({ name: 'Passers', value: passers.toString(), inline: true });
            }

            if (evaluatedUser) {
                successEmbed.addFields(
                    { name: 'Evaluated User', value: evaluatedUser, inline: true },
                    { name: 'Supervision Type', value: supervisionType, inline: true }
                );
                if (passedEval !== null) {
                    successEmbed.addFields({ name: 'Passed', value: passedEval ? 'Yes' : 'No', inline: true });
                }
            }

            if (startProof) {
                successEmbed.addFields({ name: 'Start Proof', value: `[View](${startProof})`, inline: true });
            }

            if (endProof) {
                successEmbed.addFields({ name: 'End Proof', value: `[View](${endProof})`, inline: true });
            }

            if (notes) {
                successEmbed.addFields({ name: 'Notes', value: notes, inline: false });
            }

            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            if (error instanceof LogActivityError) {
                await handleError(interaction, error);
            } else {
                console.error('Error logging activity:', error);
                await handleError(interaction, new LogActivityError(
                    'An unexpected error occurred',
                    ERROR_CODES.UNKNOWN_ERROR,
                    error.message
                ));
            }
        }
    }
};