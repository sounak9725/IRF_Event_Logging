// eslint-disable-next-line no-unused-vars
require('dotenv').config();
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder, MessageFlags } = require('discord.js');
const { sheets } = require('../../../utils/googleSheetsAuth');
const { getRowifi, interactionEmbed } = require('../../../functions');
const { logevent } = require('../../../permissions.json').stavka;

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
        range: `${sheetName}!A${startRow}:A3500`
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
        range: `${sheetName}!A${rowNumber}:A${rowNumber}`
    });
    const values = response.data.values;
    return values && values[0].some(cell => cell && cell.trim() !== '');
}

module.exports = {
    name: 'log_event_isoc',
    description: 'Log an ISOC Command event to the database',
    data: new SlashCommandBuilder()
        .setName('log_event_isoc')
        .setDescription('Log an ISOC event')
        .addStringOption(option => option.setName('event_type').setDescription('Select the event type').setRequired(true).addChoices(
            { name: 'Tryout', value: 'Tryout' },
            { name: 'Raid/Defense', value: 'Raid/Defense' },
            { name: 'Scrimmage', value: 'Scrimmage' },
            { name: 'Defense Training', value: 'Defense Training' },
            { name: 'Competitive Defense Training', value: 'Competitive Defense Training' },
            { name: 'Patrol', value: 'Patrol' },
            { name: 'Combat Training', value: 'Combat Training' },
            { name: 'Game Night', value: 'Game Night' },
            { name: 'STAVKA Event', value: 'STAVKA Event' },
            { name: 'Misc Event', value: 'Misc Event' }
        ))
        .addStringOption(option => option.setName('attendees').setDescription('Attendee usernames (comma-separated)').setRequired(true))
        .addStringOption(option => option.setName('proof').setDescription('Proof link (Gyazo, Discord App, etc.)').setRequired(true))
        .addStringOption(option => option.setName('cohosts').setDescription('Co-host usernames (comma-separated)').setRequired(false))

        .addStringOption(option => option.setName('notes').setDescription('Optional notes').setRequired(false)),

    run: async (client, interaction) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasRole) return interactionEmbed(3, '[ERR-UPRM]', 'Not proper permissions', interaction, client, [true, 30]);

            const rateLimitCheck = checkRateLimit(interaction.user.id);
            if (!rateLimitCheck.allowed) {
                const unit = rateLimitCheck.isCooldown ? 'seconds' : 'minutes';
                throw new LogQuotaError('You are being rate limited.', ERROR_CODES.RATE_LIMIT, `Please wait ${rateLimitCheck.timeLeft} ${unit}.`);
            }

            const SPREADSHEET_ID = '1zYdsiYCQIsFidWDSmGL7U4fH6TBw_-Q1CJBzf8LubQ0';
            const SHEET_NAME = 'Event Submissions';

            const rowifi = await getRowifi(interaction.user.id, client);
            if (!rowifi.success) throw new LogQuotaError('Unable to fetch your Roblox username.', ERROR_CODES.ROWIFI_ERROR, rowifi.error);

            const robloxUsername = rowifi.username;
            const eventType = interaction.options.getString('event_type');
            const cohosts = interaction.options.getString('cohosts') || 'N/A';
            const attendees = interaction.options.getString('attendees');
            const proof = interaction.options.getString('proof');
            const notes = interaction.options.getString('notes') || 'N/A';

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
                timestamp,
                robloxUsername,
                cohosts,
                eventType,
                attendees,
                proof,
                notes
            ];

            let nextRow = await findNextAvailableRow(SPREADSHEET_ID, SHEET_NAME);
            let attempts = 0;
            while (await isRowFilled(SPREADSHEET_ID, SHEET_NAME, nextRow) && attempts++ < 5) nextRow++;

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A${nextRow}:G${nextRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Event Logged')
                .addFields(
                    { name: 'Host', value: robloxUsername, inline: true },
                    { name: 'Event Type', value: eventType, inline: true },
                    { name: 'Co-Hosts', value: cohosts, inline: true },
                    { name: 'Attendees', value: attendees, inline: false },
                    { name: 'Proof', value: `[View Screenshot](${proof})`, inline: false },
                    { name: 'Notes', value: notes, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Event successfully recorded.' });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            await handleError(interaction, error instanceof LogQuotaError ? error : new LogQuotaError('Unexpected error occurred', ERROR_CODES.UNKNOWN_ERROR, error.message));
        }
    }
};
