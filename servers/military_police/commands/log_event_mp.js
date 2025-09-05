// eslint-disable-next-line no-unused-vars
require('dotenv').config();
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder, MessageFlags } = require('discord.js');
const { sheets } = require('../../../utils/googleSheetsAuth');
const { getRowifi, interactionEmbed } = require('../../../functions');
const { logevent } = require('../../../permissions.json').mp;

const HARDCODED_PASSWORD = 'HARDCODED';

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
        const timeLeft = Math.ceil((RATE_LIMIT_CONFIG.WINDOW - (now - recentRequests[0])) / 1000 / 60);
        return { allowed: false, timeLeft, isCooldown: false };
    }
    if (recentRequests.length > 0 && now - recentRequests[recentRequests.length - 1] < RATE_LIMIT_CONFIG.COOLDOWN) {
        const timeLeft = Math.ceil((RATE_LIMIT_CONFIG.COOLDOWN - (now - recentRequests[recentRequests.length - 1])) / 1000);
        return { allowed: false, timeLeft, isCooldown: true };
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
    name: 'log_event_mp',
    description: 'Log a Mass Patrol event to the tracking sheet',
    data: new SlashCommandBuilder()
        .setName('log_event_mp')
        .setDescription('Log a Mass Patrol event to the sheet')
        // Required options first
        .addStringOption(option => option.setName('event_type').setDescription('Type of event').setRequired(true).addChoices(
            { name: 'Mass Patrol', value: 'Mass Patrol' },
            { name: 'Scenario Based Training', value: 'Scenario Based Training' },
            { name: 'Recruitment Session', value: 'Recruitment Session' },
            { name: 'Tryout', value: 'Tryout' },
            { name: 'Formalities Training', value: 'Formalities Training' },
            { name: 'Discipline Training', value: 'Discipline Training' },
            { name: 'Joint Event', value: 'Joint Event' },
            {name: 'Fort Security Training', value: 'Fort Security Training' },
            { name: 'Wing Event', value: 'Wing Event' }
        ))
        .addIntegerOption(option => option.setName('total_attendees').setDescription('Total number of attendees').setRequired(true))
        .addStringOption(option => 
            option.setName('attendees')
                .setDescription('Attendee usernames and APs (e.g., fortnite546799:6,CraftyToaster2005:6)')
                .setRequired(true)
        )
        .addStringOption(option => option.setName('ap_required').setDescription('AP Required (Yes/No)').setRequired(true).addChoices(
            { name: 'Yes', value: 'Yes' },
            { name: 'No', value: 'No' }
        ))
        .addStringOption(option => option.setName('evidence').setDescription('Evidence link (Gyazo, Discord App)').setRequired(true))
        .addStringOption(option => 
            option.setName('rank')
                .setDescription('Your MP rank (e.g., Major, Sergeant Major, Probationary Constable)')
                .setRequired(true)
        )
        // Optional options below
        .addStringOption(option => option.setName('cohosts').setDescription('Co-host usernames (comma-separated)').setRequired(false))
        .addStringOption(option => option.setName('recruits').setDescription('Recruits (comma-separated)').setRequired(false))
        .addStringOption(option => option.setName('final_notes').setDescription('Optional final notes').setRequired(false)),
   /**
   * @param {Client} client
   * @param {CommandInteraction} interaction
   */    
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

            const SPREADSHEET_ID = '1VRM_cWp47krqI3pPbuWSt2OxGXxJmDqxBi88BWyn4VY';
            const SHEET_NAME = 'Event Responses';

            const rowifi = await getRowifi(interaction.user.id, client);
            if (!rowifi.success) throw new LogQuotaError('Unable to fetch your Roblox username.', ERROR_CODES.ROWIFI_ERROR, rowifi.error);
            const robloxUsername = rowifi.username;

            const rank = interaction.options.getString('rank');

            const timestamp = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
            });

            const eventType = interaction.options.getString('event_type');
            const totalAttendees = interaction.options.getInteger('total_attendees');
            if (!Number.isInteger(totalAttendees) || totalAttendees < 1) {
                throw new LogQuotaError('Total attendees must be a positive integer.', ERROR_CODES.VALIDATION_ERROR);
            }

            const attendees = interaction.options.getString('attendees');
            const attendeeRegex = /^([a-zA-Z0-9_]+:\d+)(,([a-zA-Z0-9_]+:\d+))*$/;
            if (!attendeeRegex.test(attendees)) {
                throw new LogQuotaError(
                    'Attendees must be in the format: username:AP,username:AP (e.g., fortnite546799:6,CraftyToaster2005:6)',
                    ERROR_CODES.VALIDATION_ERROR
                );
            }
            const attendeeList = attendees.split(',').map(a => a.trim()).filter(Boolean);
            if (attendeeList.length !== totalAttendees) {
                throw new LogQuotaError(
                    `Total attendees (${totalAttendees}) does not match the number of attendees provided (${attendeeList.length}).`,
                    ERROR_CODES.VALIDATION_ERROR
                );
            }
            const apRequired = interaction.options.getString('ap_required');
            const evidence = interaction.options.getString('evidence');
            const cohosts = interaction.options.getString('cohosts') || 'N/A';
            const recruits = interaction.options.getString('recruits') || 'N/A';
            const finalNotes = interaction.options.getString('final_notes') || 'N/A';

            // Validate recruits only if event type is Recruitment Session
            if (eventType === 'Recruitment Session' && (!recruits || recruits === 'N/A')) {
                throw new LogQuotaError('Recruits are required for Recruitment Session events.', ERROR_CODES.VALIDATION_ERROR);
            }

            const rowData = [
                timestamp,
                HARDCODED_PASSWORD,
                robloxUsername,
                rank,
                cohosts,
                eventType,
                totalAttendees.toString(),
                attendees,
                recruits,
                apRequired,
                finalNotes,
                evidence
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

            // If event is Recruitment Session or Tryout and recruits are present, send embed to MPA command channel
            if (
                (eventType === 'Recruitment Session' || eventType === 'Tryout') &&
                recruits &&
                recruits !== 'N/A'
            ) {
                const mpaChannelId = '1387773649486090270';
                const mpaChannel = await client.channels.fetch(mpaChannelId).catch(() => null);
                if (mpaChannel && mpaChannel.isTextBased()) {
                    const recruitsList = recruits.split(',').map(r => r.trim()).filter(Boolean).join(', ');
                    const recruitEmbed = new EmbedBuilder()
                        .setColor('#0099ff')
                        .setTitle('New Recruits Logged')
                        .setDescription(`**Event Type:** ${eventType}\n**Host:** ${robloxUsername}\n**Recruits:** ${recruitsList}`)
                        .setTimestamp();
                    await mpaChannel.send({ embeds: [recruitEmbed] });
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Event Logged')
                .addFields(
                    { name: 'Host', value: robloxUsername, inline: true },
                    { name: 'Rank', value: rank, inline: true },
                    { name: 'Event Type', value: eventType, inline: true },
                    { name: 'Co-Hosts', value: cohosts, inline: true },
                    { name: 'Total Attendees', value: totalAttendees.toString(), inline: true },
                    { name: 'Recruits', value: recruits, inline: true },
                    { name: 'AP Required', value: apRequired, inline: true },
                    { name: 'Evidence', value: `[View Screenshot](${evidence})`, inline: false },
                    { name: 'Final Notes', value: finalNotes, inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'Event successfully recorded.' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            await handleError(interaction, error instanceof LogQuotaError ? error : new LogQuotaError('Unexpected error occurred', ERROR_CODES.UNKNOWN_ERROR, error.message));
        }
    }
};
