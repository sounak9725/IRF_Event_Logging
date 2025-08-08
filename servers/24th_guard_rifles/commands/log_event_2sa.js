// eslint-disable-next-line no-unused-vars
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder, MessageFlags } = require('discord.js');
const { sheets } = require('../../../utils/googleSheetsAuth');
const { getRowifi, interactionEmbed } = require('../../../functions');
const { logevent } = require('../../../permissions.json')['24thsa'];

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

async function findNextAvailableRow(spreadsheetId, sheetName, startRow = 2) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!C${startRow}:C3500`
    });
    const values = response.data.values || [];
    for (let i = 0; i < values.length; i++) {
        if (!values[i][0]) return startRow + i;
    }
    return startRow + values.length;
}

async function isRowFilled(spreadsheetId, sheetName, rowNumber) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!C${rowNumber}:C${rowNumber}`
    });
    const values = response.data.values;
    return values && values[0].some(cell => cell && cell.trim() !== '');
}

module.exports = {
    name: 'log_event_2sa',
    description: 'Log a Regiment event to the quota tracking sheet',
    data: new SlashCommandBuilder()
        .setName('log_event_2sa')
        .setDescription('Log a Regiment event to the quota tracking sheet')
        .addStringOption(option => option.setName('event_type').setDescription('What type of event was hosted?').setRequired(true).addChoices(
            { name: '24th Inspection/Meeting', value: '24th Inspection/Meeting' },
            { name: 'Combat Training', value: 'Combat Training' },
            { name: 'Tryout', value: 'Tryout' },
            { name: 'Raid', value: 'Raid' },
            { name: 'Defense Training', value: 'Defense Training' },
            { name: 'Recruitment Session', value: 'Recruitment Session' },
            { name: 'Discipline Training', value: 'Discipline Training' },
            { name: 'Patrol', value: 'Patrol' },
            { name: 'Combat Patrol', value: 'Combat Patrol' },
            { name: 'Other', value: 'Other' }
        ))
        .addStringOption(option => option.setName('cohosts').setDescription('Co-host usernames (comma-separated)').setRequired(true))
        .addStringOption(option => option.setName('attendees').setDescription('Attendees usernames (comma-separated)').setRequired(true))
        .addStringOption(option => option.setName('proof').setDescription('Link to image/screenshot of the event').setRequired(true))
        .addIntegerOption(option => option.setName('duration').setDescription('Total time of the event (in minutes)').setRequired(true))
        .addStringOption(option => option.setName('notes').setDescription('Optional notes').setRequired(false)),

    run: async (client, interaction) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {

            const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasRole) {
             return interactionEmbed(3, "[ERR-UPRM]", 'Not proper permissions', interaction, client, [true, 30]);
             }

            const rateLimitCheck = checkRateLimit(interaction.user.id);
            if (!rateLimitCheck.allowed) {
                const unit = rateLimitCheck.isCooldown ? 'seconds' : 'minutes';
                throw new LogQuotaError('You are being rate limited.', ERROR_CODES.RATE_LIMIT, `Please wait ${rateLimitCheck.timeLeft} ${unit}.`);
            }

            const SPREADSHEET_ID = '17gFnftqf5a7ncPROaIdP6iUixKKHS5T9gqp3Aqe8P8w';
            const SHEET_NAME = 'QUOForm';

            const rowifi = await getRowifi(interaction.user.id, client);
            if (!rowifi.success) throw new LogQuotaError('Unable to fetch your Roblox username.', ERROR_CODES.ROWIFI_ERROR, rowifi.error);

            const robloxUsername = rowifi.username;
            const discordUsername = interaction.user.username;
            const eventType = interaction.options.getString('event_type');
            const cohosts = interaction.options.getString('cohosts');
            const attendeesRaw = interaction.options.getString('attendees');
            const proof = interaction.options.getString('proof');
            const duration = interaction.options.getInteger('duration');
            const notes = interaction.options.getString('notes') || 'N/A';

            // --- Attendees validation and count ---
            // Valid format: name, name, name (no trailing comma, single space after comma)
            const attendeesPattern = /^([a-zA-Z0-9_]+)(, [a-zA-Z0-9_]+)*$/;
            if (!attendeesPattern.test(attendeesRaw.trim())) {
                throw new LogQuotaError(
                    'Invalid attendees format.',
                    ERROR_CODES.VALIDATION_ERROR,
                    'Attendees must be a comma and space separated list, e.g.: macy, suman, larz, kiler, etc.'
                );
            }
            // Count attendees
            const attendeesList = attendeesRaw.split(',').map(name => name.trim()).filter(Boolean);
            const attendeeCount = attendeesList.length;

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

            const rowData = [
                '',
                '',
                timestamp,
                robloxUsername,
                discordUsername,
                eventType,
                cohosts,
                attendeesRaw,
                attendeeCount.toString(),
                proof,
                duration.toString(),
                notes
            ];

            let nextRow = await findNextAvailableRow(SPREADSHEET_ID, SHEET_NAME);
            let attempts = 0;
            while (await isRowFilled(SPREADSHEET_ID, SHEET_NAME, nextRow) && attempts++ < 5) nextRow++;

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A${nextRow}:L${nextRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Event Logged')
                .addFields(
                    { name: 'Host', value: robloxUsername, inline: true },
                    { name: 'Discord Username', value: discordUsername, inline: true },
                    { name: 'Event Type', value: eventType, inline: true },
                    { name: 'Co-hosts', value: cohosts, inline: true },
                    { name: 'Attendees', value: attendeeCount.toString(), inline: true },
                    { name: 'Duration (min)', value: duration.toString(), inline: true },
                    { name: 'Proof', value: `[View Screenshot](${proof})`, inline: false },
                    { name: 'Notes', value: notes || 'N/A', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Event successfully recorded.' });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            await handleError(interaction, error instanceof LogQuotaError ? error : new LogQuotaError('Unexpected error occurred', ERROR_CODES.UNKNOWN_ERROR, error.message));
        }
    }
};
