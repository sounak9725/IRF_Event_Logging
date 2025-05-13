const { SlashCommandBuilder, EmbedBuilder, CommandInteraction, MessageFlags, CommandInteractionOptionResolver } = require('discord.js');
const { sheets } = require('../../../utils/googleSheetsAuth');
const config = require('../../../config.json');
const { getRowifi, interactionEmbed } = require('../../../functions');
const { logpu } = require('../../../permissions.json').ndd;

// Error handling class
class LogQuotaError extends Error {
    constructor(message, code, details = null) {
        super(message);
        this.name = 'LogQuotaError';
        this.code = code;
        this.details = details;
    }
}

const ERROR_CODES = {
    VALIDATION_ERROR: 'ERR-VALIDATION',
    SHEETS_ERROR: 'ERR-SHEETS',
    UNKNOWN_ERROR: 'ERR-UNKNOWN',
};

// Helper: Find next empty row
async function findNextAvailableRow(spreadsheetId, sheetName, startRow = 2) {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A${startRow}:A5000`, // Fetch column A from startRow to row 5000
        });

        const values = response.data.values || [];

        // Iterate through the rows to find the first empty one
        for (let i = 0; i < values.length; i++) {
            if (!values[i] || !values[i][0] || values[i][0].trim() === '') {
                return startRow + i;
            }
        }

        // If all rows are filled, return the next row after the last one
        return startRow + values.length;
    } catch (error) {
        console.error('Error finding next available row:', error);
        return startRow; // Fallback to startRow in case of an error
    }
}

// Helper: Check if a row is filled
async function isRowFilled(spreadsheetId, sheetName, rowNumber) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetName}!A${rowNumber}:C${rowNumber}`
    });
    const values = response.data.values;
    return values && values[0].some(cell => cell && cell.trim() !== '');
}

module.exports = {
    name: 'log_rds',
    description: 'Log an RDS assessment to the tracking sheet',
    data: new SlashCommandBuilder()
        .setName('log_rds')
        .setDescription('Log an RDS assessment')
        .addStringOption(option =>
            option.setName('assessed_nco')
                .setDescription('Username of the NCO you assessed')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('rds_stage')
                .setDescription('Stage of the RDS process')
                .setRequired(true)
                .addChoices(
                    { name: 'Co-Host', value: 'Co-Host' },
                    { name: 'Supervision 1', value: 'Supervision 1' },
                    { name: 'Supervision 2', value: 'Supervision 2' },
                    { name: 'Evaluation', value: 'Evaluation' },
                    { name: 'Exam 1', value: 'Exam 1' },
                    { name: 'Exam 2', value: 'Exam 2' },
                    { name: 'Exam 3', value: 'Exam 3' }
                ))
        .addStringOption(option =>
            option.setName('type_of_event')
                .setDescription('Type of event conducted')
                .setRequired(true)
                .addChoices(
                    { name: 'Combat Training', value: 'Combat Training' },
                    { name: 'Border Simulation', value: 'Border Simulation' },
                    { name: 'Protocol', value: 'Protocol' },
                    { name: 'Enhancement Training', value: 'Enhancement Training' },
                    { name: 'Medical Training', value: 'Medical Training' },
                    { name: 'Exam', value: 'Exam' },
                    { name: 'DT Tryout', value: 'DT Tryout' },
                    { name: 'Tryout', value: 'Tryout' }
                ))
        .addStringOption(option =>
            option.setName('result')
                .setDescription('Result of the assessment (Pass/Fail/etc.)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('score')
                .setDescription('Score (number in 75/100 format not anything else)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('wedge_picture')
                .setDescription('Link to wedge proof screenshot')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('rubric')
                .setDescription('Link to grading rubric')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('notes')
                .setDescription('Any additional notes')
                .setRequired(true)),
     /**
    * @param {Client} client
    * @param {CommandInteraction} interaction
    */       
    run: async (client, interaction) => {
       
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });


        try {

            const hasRole = logpu.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasRole) {
             return interactionEmbed(3, "[ERR-UPRM]", 'Not proper permissions', interaction, client, [true, 30]);
             }
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

            const SPREADSHEET_ID = '1HFjg2i0KiH956mdFRaoVzCNUAI5XaiNhIdh0i2bZ_fc';
            const SHEET_NAME = 'Sheet6';

            const timestamp = new Date().toLocaleString('en-GB', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit',
                hour12: false
            });

            const robloxUsername = rowifiResult.username;
            const discordUsername = interaction.user.username;
            const assessedNCO = interaction.options.getString('assessed_nco');
            const rdsStage = interaction.options.getString('rds_stage');
            const eventType = interaction.options.getString('type_of_event');
            const result = interaction.options.getString('result');
            const score = interaction.options.getString('score');
            const wedgePic = interaction.options.getString('wedge_picture');
            const rubric = interaction.options.getString('rubric');
            const notes = interaction.options.getString('notes');
            const commandCode = "HARD-LOG-RDS";

            const isValidUrl = (url) => {
                const urlRegex = /^(https?:\/\/[^\s$.?#].[^\s]*)$/i;
                return urlRegex.test(url);
            };

            if (!isValidUrl(wedgePic) || !isValidUrl(rubric)) {
                throw new LogQuotaError(
                    'One or more links provided are invalid.',
                    ERROR_CODES.VALIDATION_ERROR,
                    'Please make sure both the wedge picture and rubric are valid URLs.'
                );
            }

            const rowData = [
                timestamp,
                robloxUsername,
                discordUsername,
                assessedNCO,
                rdsStage,
                eventType,
                result,
                score,
                wedgePic,
                rubric,
                notes,
                commandCode
            ];

            const nextRow = await findNextAvailableRow(SPREADSHEET_ID, SHEET_NAME, 2);

            // Double-check if the row is empty
            const isFilled = await isRowFilled(SPREADSHEET_ID, SHEET_NAME, nextRow);
            if (isFilled) {
                throw new LogQuotaError(
                    'The next row is unexpectedly filled. Please contact an administrator.',
                    ERROR_CODES.SHEETS_ERROR,
                    `Row ${nextRow} is already filled.`
                );
            }

            // Write data to the sheet
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A${nextRow}:L${nextRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ RDS Log Submitted')
                .setDescription('Your RDS assessment log has been recorded.')
                .addFields(
                    { name: 'Assessed NCO', value: assessedNCO, inline: true },
                    { name: 'Stage', value: rdsStage, inline: true },
                    { name: 'Type of Event', value: eventType, inline: true },
                    { name: 'Result', value: result, inline: true },
                    { name: 'Score', value: score, inline: true },
                    { name: 'Rubric', value: `[View Rubric](${rubric})`, inline: false },
                    { name: 'Wedge Screenshot', value: `[View Screenshot](${wedgePic})`, inline: false },
                    { name: 'Command Code', value: commandCode, inline: true },
                    { name: 'Notes', value: notes || 'N/A', inline: false }
                )
                .setTimestamp()
                .setFooter({ text: 'RDS Log System' });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Failed to log RDS')
                .setDescription(error.message || 'Unexpected error occurred.');

            if (error.code === ERROR_CODES.SHEETS_ERROR) {
                embed.addFields({ name: 'Details', value: 'There was an issue with Google Sheets. Please try again later.' });
            } else if (error.code === ERROR_CODES.VALIDATION_ERROR) {
                embed.addFields({ name: 'Details', value: error.details || 'Invalid input provided.' });
            } else if (error.code === ERROR_CODES.ROWIFI_ERROR) {
                embed.addFields({ name: 'Details', value: error.details || 'Unable to fetch Roblox username from RoWifi.' });
            }

            console.error(error);
            await interaction.editReply({ embeds: [embed] });
        }
    }
};
