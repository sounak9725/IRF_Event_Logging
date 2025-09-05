// eslint-disable-next-line no-unused-vars
require('dotenv').config();
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder, MessageFlags } = require('discord.js');
const { sheets } = require('../../../utils/googleSheetsAuth');
const { getRowifi, interactionEmbed } = require('../../../functions');
const { logevent } = require('../../../permissions.json').rg;

class LogQuotaError extends Error {
    constructor(message, code, details = null) {
        super(message);
        this.name = 'LogQuotaError';
        this.code = code;
        this.details = details;
    }
}

const ERROR_CODES = {
    PERMISSION_DENIED: 'ERR-UPRM',
    ROWIFI_ERROR: 'ERR-ROWIFI',
    VALIDATION_ERROR: 'ERR-VALIDATION',
    SHEETS_ERROR: 'ERR-SHEETS',
    UNKNOWN_ERROR: 'ERR-UNKNOWN',
    RATE_LIMIT: 'ERR-RATELIMIT'
};

const RATE_LIMIT_CONFIG = {
    WINDOW: 60 * 60 * 1000,
    MAX_REQUESTS: 10,
    COOLDOWN: 1 * 60 * 1000
};

const userRequestsMap = new Map();

function checkRateLimit(userId) {
    const now = Date.now();
    const userRequests = userRequestsMap.get(userId) || [];
    const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_CONFIG.WINDOW);
    if (recentRequests.length >= RATE_LIMIT_CONFIG.MAX_REQUESTS) {
        const oldestRequest = recentRequests[0];
        const timeLeft = Math.ceil((RATE_LIMIT_CONFIG.WINDOW - (now - oldestRequest)) / 1000 / 60);
        return { allowed: false, timeLeft, isCooldown: false };
    }
    if (recentRequests.length > 0) {
        const lastRequest = recentRequests[recentRequests.length - 1];
        const timeSinceLastRequest = now - lastRequest;
        if (timeSinceLastRequest < RATE_LIMIT_CONFIG.COOLDOWN) {
            const timeLeft = Math.ceil((RATE_LIMIT_CONFIG.COOLDOWN - timeSinceLastRequest) / 1000);
            return { allowed: false, timeLeft, isCooldown: true };
        }
    }
    recentRequests.push(now);
    userRequestsMap.set(userId, recentRequests);
    return { allowed: true };
}

function createErrorEmbed(error) {
    const embed = new EmbedBuilder().setColor('#FF0000').setTitle('❌ Error').setDescription(error.message);
    if (error.details) embed.addFields({ name: 'Details', value: error.details });
    return embed;
}

async function handleError(interaction, error) {
    console.error(`[${error.code || ERROR_CODES.UNKNOWN_ERROR}] ${error.message}`, error);
    const embed = createErrorEmbed(error);
    if (interaction.deferred) {
        await interaction.editReply({ embeds: [embed], ephemeral: true }).catch(console.error);
    } else {
        await interaction.reply({ embeds: [embed], ephemeral: true }).catch(console.error);
    }
}

function handleSheetsError(error) {
    if (error.message && error.message.includes('The caller does not have permission')) {
        throw new LogQuotaError(
            'Google Sheets Permission Error',
            ERROR_CODES.SHEETS_ERROR,
            'The bot does not have permission to access the Google Sheet. Please check the service account permissions.'
        );
    }
    if (error.message && error.message.includes('Quota exceeded')) {
        throw new LogQuotaError(
            'Google Sheets Quota Exceeded',
            ERROR_CODES.SHEETS_ERROR,
            'Google Sheets API quota has been exceeded. Please try again later.'
        );
    }
    if (error.message && error.message.includes('not found')) {
        throw new LogQuotaError(
            'Google Sheets Not Found',
            ERROR_CODES.SHEETS_ERROR,
            'The specified Google Sheet or range was not found. Please check the sheet configuration.'
        );
    }
    // Generic sheets error
    throw new LogQuotaError(
        'Google Sheets Error',
        ERROR_CODES.SHEETS_ERROR,
        error.message || 'An error occurred while accessing Google Sheets'
    );
}

async function findNextAvailableRow(spreadsheetId, sheetName, startRow = 2) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!C${startRow}:C3500`
        });
        const values = response.data.values || [];
        for (let i = 0; i < values.length; i++) {
            if (!values[i][0]) return startRow + i;
        }
        return startRow + values.length;
    } catch (error) {
        handleSheetsError(error);
    }
}

async function isRowFilled(spreadsheetId, sheetName, rowNumber) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!C${rowNumber}:C${rowNumber}`
        });
        const values = response.data.values;
        return values && values[0].some(cell => cell && cell.trim() !== '');
    } catch (error) {
        handleSheetsError(error);
    }
}

module.exports = {
    name: 'log_event_rg',
    description: 'Log a Guard/Training event to the tracking sheet',
    data: new SlashCommandBuilder()
        .setName('log_event_rg')
        .setDescription('Log a Guard/Training event to the sheet')
        .addBooleanOption(option => option.setName('supervised').setDescription('Was this event supervised?').setRequired(true))
        .addStringOption(option => option.setName('event_type').setDescription('Event type').setRequired(true).addChoices(
            { name: 'Guarding Training', value: 'Guarding Training' },
            { name: 'Situational Training', value: 'Situational Training' },
            { name: 'Patrol', value: 'Patrol' },
            { name: 'Combat Training', value: 'Combat Training' },
            { name: 'Tryout', value: 'Tryout' },
            { name: 'Scrim/Joint-event', value: 'Scrim/Joint-event' },
            { name: 'Other', value: 'Other' },
            { name: 'Etiquette Training', value: 'Etiquette Training' },
        ))
        .addStringOption(option => option.setName('cohosts').setDescription('Co-hosts (comma separated)').setRequired(false))
        .addStringOption(option => option.setName('supervisor').setDescription('Supervisor username').setRequired(false))
        .addStringOption(option => option.setName('gyazo').setDescription('Gyazo or Discord App screenshot link').setRequired(false))
        .addStringOption(option => option.setName('attendees').setDescription('Attendees and QP (user1:5, user2:3)').setRequired(false))
        .addIntegerOption(option => option.setName('attendee_count').setDescription('Total number of attendees').setRequired(false))
        .addStringOption(option => option.setName('notes').setDescription('Training notes').setRequired(false))
        .addStringOption(option => option.setName('which_event').setDescription('Name or theme of the event (IF OTHER IS CHOSEN)').setRequired(false))
        .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes (IF OTHER IS CHOSEN)').setRequired(false)),

    run: async (client, interaction) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId.trim()));
            if (!hasRole) {
                return interactionEmbed(3, "[ERR-UPRM]", 'Not proper permissions', interaction, client, [true, 30]);
            }

            const rateLimitCheck = checkRateLimit(interaction.user.id);
            if (!rateLimitCheck.allowed) {
                const unit = rateLimitCheck.isCooldown ? 'seconds' : 'minutes';
                throw new LogQuotaError('You are being rate limited.', ERROR_CODES.RATE_LIMIT, `Please wait ${rateLimitCheck.timeLeft} ${unit}.`);
            }

            const SPREADSHEET_ID = '1LaVesC0sn62BuwyvbT-PNNlR71JG3mP2QUN0iiGdpLk';
            const SHEET_NAME = 'Responses';

            const rowifi = await getRowifi(interaction.user.id, client);
            if (!rowifi.success) throw new LogQuotaError('Unable to fetch your Roblox username.', ERROR_CODES.ROWIFI_ERROR, rowifi.error);

            const robloxUsername = rowifi.username;
            const eventType = interaction.options.getString('event_type');
            const cohosts = interaction.options.getString('cohosts');
            const supervisor = interaction.options.getString('supervisor');
            const gyazo = interaction.options.getString('gyazo');
            const attendees = interaction.options.getString('attendees');
            const attendeeCount = interaction.options.getInteger('attendee_count');
            const notes = interaction.options.getString('notes');
            const whichEvent = interaction.options.getString('which_event');
            const duration = interaction.options.getInteger('duration');
            const supervised = interaction.options.getBoolean('supervised') ? 'Yes' : 'No';

            // **Validation for "Other" Event Type**
            if (eventType === 'Other') {
                if (!whichEvent || !duration) {
                    throw new LogQuotaError(
                        'Validation Error',
                        ERROR_CODES.VALIDATION_ERROR,
                        'When "Other" is selected as the event type, "which_event" and "duration" are required.'
                    );
                }
            }

            // **Validation for Supervised Events**
            if (supervised === 'Yes' && !supervisor) {
                throw new LogQuotaError(
                    'Validation Error',
                    ERROR_CODES.VALIDATION_ERROR,
                    'When the event is supervised, the supervisor name must be provided.'
                );
            }

            const timestamp = new Date().toLocaleString('en-GB', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
            });

            const rowData = [
                timestamp,
                supervised,
                robloxUsername,
                supervisor,
                cohosts,
                eventType,
                gyazo,
                'HARDCODED', // File screenshot placeholder
                attendees,
                attendeeCount ? attendeeCount.toString() : '',
                notes,
                whichEvent,
                duration ? duration.toString() : ''
            ];

            let nextRow = await findNextAvailableRow(SPREADSHEET_ID, SHEET_NAME);
            let attempts = 0;
            while (await isRowFilled(SPREADSHEET_ID, SHEET_NAME, nextRow) && attempts++ < 5) nextRow++;

            try {
                await sheets.spreadsheets.values.update({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${SHEET_NAME}!A${nextRow}:M${nextRow}`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [rowData] }
                });
            } catch (error) {
                handleSheetsError(error);
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Event Logged')
                .addFields(
                    { name: 'Host', value: robloxUsername, inline: true },
                    { name: 'Supervised?', value: supervised, inline: true },
                    { name: 'Event Type', value: eventType, inline: true },
                    { name: 'Attendees', value: attendeeCount ? attendeeCount.toString() : 'N/A', inline: true },
                    { name: 'Duration (min)', value: duration ? duration.toString() : 'N/A', inline: true },
                    { name: 'Proof', value: gyazo ? `[Gyazo](${gyazo})` : 'N/A', inline: false },
                    { name: 'Notes', value: notes || 'N/A', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Event successfully recorded.' });

            if (eventType === 'Other') {
                embed.addFields(
                    { name: 'Event Name/Theme', value: whichEvent || 'N/A', inline: false }
                );
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            await handleError(interaction, error instanceof LogQuotaError ? error : new LogQuotaError('Unexpected error occurred', ERROR_CODES.UNKNOWN_ERROR, error.message));
        }
    }
};