// eslint-disable-next-line no-unused-vars
require('dotenv').config();
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { sheets } = require('../../../utils/googleSheetsAuth');
const { interactionEmbed } = require('../../../functions');
const { logevent } = require('../../../permissions.json').rg;

const SPREADSHEET_ID = '1LaVesC0sn62BuwyvbT-PNNlR71JG3mP2QUN0iiGdpLk';
const SHEET_NAME = 'DoPR | GiT Database';

class LogDoPRError extends Error {
    constructor(message, code, details = null) {
        super(message);
        this.name = 'LogDoPRError';
        this.code = code;
        this.details = details;
    }
}

const ERROR_CODES = {
    PERMISSION_DENIED: 'ERR-UPRM',
    VALIDATION_ERROR: 'ERR-VALIDATION',
    SHEETS_ERROR: 'ERR-SHEETS',
    UNKNOWN_ERROR: 'ERR-UNKNOWN'
};

// Column mappings based on the actual CSV structure
const COLUMNS = {
    USERNAME: 'C',      // Column C: Username
    RANK: 'E',          // Column E: Rank
    STAGE1_EE: 'G',     // Column G: Stage 1 - EE (Etiquette)
    STAGE1_GT: 'I',     // Column I: Stage 1 - GT (Guarding Training)
    STAGE1_ST: 'J',     // Column J: Stage 1 - ST (Situational Training)
    STAGE1_CT: 'K',     // Column K: Stage 1 - CT (Combat Training)
    STAGE2_FE: 'M',     // Column M: Stage 2 - FE (Final Evaluation)
};

// Event type to column mapping
const EVENT_COLUMN_MAP = {
    'EE': COLUMNS.STAGE1_EE,  // Column G
    'GT': COLUMNS.STAGE1_GT,  // Column I
    'ST': COLUMNS.STAGE1_ST,  // Column J
    'CT': COLUMNS.STAGE1_CT,  // Column K
    'FE': COLUMNS.STAGE2_FE   // Column M
};

// Update the getAllUsernames function to use column C
async function getAllUsernames() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!C:C`,  // Changed from A:A to C:C
        });
        
        const rows = response.data.values || [];
        // Create a map of username to row number (1-indexed)
        const usernameMap = new Map();
        rows.forEach((row, index) => {
            // Skip empty rows and process all rows with usernames
            if (row[0] && row[0].trim() !== '' && row[0] !== 'Username') {
                const username = row[0].toLowerCase().trim();
                const rowNumber = index + 1; // 1-indexed for Google Sheets
                usernameMap.set(username, rowNumber);
                console.log(`Mapped username: ${username} to row ${rowNumber}`);
            }
        });
        
        console.log(`Total usernames mapped: ${usernameMap.size}`);
        return usernameMap;
    } catch (error) {
        console.error('Error getting usernames:', error);
        throw new LogDoPRError('Failed to access spreadsheet', ERROR_CODES.SHEETS_ERROR, error.message);
    }
}

async function updateStudentProgress(username, column, value) {
    try {
        const usernameMap = await getAllUsernames();
        const rowNumber = usernameMap.get(username.toLowerCase().trim());
        
        if (!rowNumber) {
            throw new LogDoPRError(`User ${username} not found in the database`, ERROR_CODES.VALIDATION_ERROR);
        }
        
        const range = `${SHEET_NAME}!${column}${rowNumber}`;
        
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [[value]]
            }
        });
        
        return rowNumber;
    } catch (error) {
        console.error('Error updating student progress:', error);
        throw error;
    }
}

async function batchUpdateStudents(updates) {
    try {
        const data = updates.map(update => ({
            range: `${SHEET_NAME}!${update.range}`,
            values: [[update.value]]
        }));
        
        await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: data
            }
        });
        
        return true;
    } catch (error) {
        console.error('Error batch updating students:', error);
        throw new LogDoPRError('Failed to update spreadsheet', ERROR_CODES.SHEETS_ERROR, error.message);
    }
}

function parseParticipants(participantString) {
    if (!participantString) return [];
    return participantString.split(',').map(item => {
        const parts = item.split(':').map(s => s.trim());
        return { 
            name: parts[0], 
            value: parts[1] || 'YES' 
        };
    });
}

module.exports = {
    name: 'log_event_dopr',
    description: 'Log a DoPR event to the tracking sheet',
    data: new SlashCommandBuilder()
        .setName('log_event_dopr')
        .setDescription('Log a DoPR event to the tracking sheet')
        .addStringOption(option => 
            option.setName('event_type')
                .setDescription('Type of event')
                .setRequired(true)
                .addChoices(
                    { name: 'Training - EE (Etiquette)', value: 'EE' },
                    { name: 'Training - GT (Guarding)', value: 'GT' },
                    { name: 'Training - ST (Situational)', value: 'ST' },
                    { name: 'Training - CT (Combat)', value: 'CT' },
                    { name: 'Recruitment Session/Tryout', value: 'recruitment' },
                    { name: 'Final Evaluation', value: 'FE' }
                )
        )
        .addStringOption(option => 
            option.setName('username')
                .setDescription('Your username (host)')
                .setRequired(true)
        )
        .addStringOption(option => 
            option.setName('cohost')
                .setDescription('Co-host username (if any)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('supervisor')
                .setDescription('Supervisor username (if any)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('rgs')
                .setDescription('RGs present (format: name1:score, name2:score OR name1,name2 for recruitment)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('gits')
                .setDescription('GiTs present (format: git1:score, git2:score OR git1,git2)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('passers')
                .setDescription('Recruitment passers (comma separated usernames)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('fails')
                .setDescription('Recruitment fails (comma separated usernames)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('ng_name')
                .setDescription('NG username for Final Evaluation')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('ng_score')
                .setDescription('NG Score (e.g., 15/20 | Passed or Failed)')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('fe_results_link')
                .setDescription('Link to Final Evaluation results')
                .setRequired(false)
        )
        .addStringOption(option => 
            option.setName('proof')
                .setDescription('Proof of event (Screenshot/Wedge link)')
                .setRequired(false)
        ),

    run: async (client, interaction) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        try {
            // Check permissions
            const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId.trim()));
            if (!hasRole) {
                return interactionEmbed(3, "[ERR-UPRM]", 'You do not have permission to use this command.', interaction, client, [true, 30]);
            }

            // Get all options
            const eventType = interaction.options.getString('event_type');
            const username = interaction.options.getString('username');
            const cohost = interaction.options.getString('cohost');
            const supervisor = interaction.options.getString('supervisor');
            const rgs = interaction.options.getString('rgs');
            const gits = interaction.options.getString('gits');
            const passers = interaction.options.getString('passers');
            const fails = interaction.options.getString('fails');
            const ngName = interaction.options.getString('ng_name');
            const ngScore = interaction.options.getString('ng_score');
            const feResultsLink = interaction.options.getString('fe_results_link');
            const proof = interaction.options.getString('proof');

            const usernameMap = await getAllUsernames();
            const updatedUsers = [];
            const notFoundUsers = [];
            const updates = [];

            // Handle different event types
            if (eventType === 'EE' || eventType === 'GT' || eventType === 'ST' || eventType === 'CT') {
                // Training event
                if (!rgs && !gits) {
                    return interactionEmbed(3, "[ERR-VALIDATION]", 'For Training events, at least RGs or GiTs must be provided.', interaction, client, [true, 30]);
                }

                const targetColumn = EVENT_COLUMN_MAP[eventType];

                // Process RGs
                if (rgs) {
                    const rgList = parseParticipants(rgs);
                    for (const rg of rgList) {
                        const rowNum = usernameMap.get(rg.name.toLowerCase().trim());
                        if (rowNum) {
                            updates.push({ range: `${targetColumn}${rowNum}`, value: rg.value });
                            updatedUsers.push(`${rg.name} (${rg.value})`);
                        } else {
                            notFoundUsers.push(rg.name);
                        }
                    }
                }

                // Process GiTs
                if (gits) {
                    const gitList = parseParticipants(gits);
                    for (const git of gitList) {
                        const rowNum = usernameMap.get(git.name.toLowerCase().trim());
                        if (rowNum) {
                            updates.push({ range: `${targetColumn}${rowNum}`, value: git.value });
                            updatedUsers.push(`${git.name} (${git.value})`);
                        } else {
                            notFoundUsers.push(git.name);
                        }
                    }
                }

            } else if (eventType === 'recruitment') {
                // Recruitment event - mark passers as YES
                if (!passers && !fails) {
                    return interactionEmbed(3, "[ERR-VALIDATION]", 'For Recruitment events, at least passers or fails must be provided.', interaction, client, [true, 30]);
                }

                if (passers) {
                    const passerList = passers.split(',').map(s => s.trim());
                    for (const passer of passerList) {
                        const rowNum = usernameMap.get(passer.toLowerCase().trim());
                        if (rowNum) {
                            // Mark as YES in the appropriate column (assuming we track recruitment completion)
                            updates.push({ range: `${COLUMNS.STAGE1_EE}${rowNum}`, value: 'YES' });
                            updatedUsers.push(`${passer} (Passed)`);
                        } else {
                            notFoundUsers.push(passer);
                        }
                    }
                }

                // Fails are left as-is (no update needed)

            } else if (eventType === 'FE') {
                // Final Evaluation
                if (!ngName || !ngScore) {
                    return interactionEmbed(3, "[ERR-VALIDATION]", 'For Final Evaluations, both NG name and score are required.', interaction, client, [true, 30]);
                }

                // Check if passed or failed based on score
                const passed = ngScore.toLowerCase().includes('passed');
                
                const rowNum = usernameMap.get(ngName.toLowerCase().trim());
                if (rowNum) {
                    if (passed) {
                        updates.push({ range: `${COLUMNS.STAGE2_FE}${rowNum}`, value: 'YES' });
                        updatedUsers.push(`${ngName} (${ngScore})`);
                    }
                    // If failed, leave as-is
                } else {
                    notFoundUsers.push(ngName);
                }
            }

            // Perform batch update
            if (updates.length > 0) {
                await batchUpdateStudents(updates);
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(updates.length > 0 ? '#00ff00' : '#ffaa00')
                .setTitle('DoPR Event Logged')
                .addFields(
                    { name: 'Event Type', value: eventType, inline: true },
                    { name: 'Host', value: username, inline: true },
                    { name: 'Updated Students', value: updatedUsers.length > 0 ? updatedUsers.join('\n') : 'None', inline: false }
                );

            if (cohost) embed.addFields({ name: 'Co-host', value: cohost, inline: true });
            if (supervisor) embed.addFields({ name: 'Supervisor', value: supervisor, inline: true });
            if (notFoundUsers.length > 0) {
                embed.addFields({ name: '⚠️ Not Found in Database', value: notFoundUsers.join(', '), inline: false });
            }
            if (proof) embed.addFields({ name: 'Proof', value: `[View Proof](${proof})`, inline: false });
            if (feResultsLink) embed.addFields({ name: 'FE Results', value: `[View Results](${feResultsLink})`, inline: false });

            embed.setFooter({ text: `${updates.length} student(s) updated in ${SHEET_NAME}` })
                 .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in log_event_dopr:', error);
            const errorMessage = error.details || error.message || 'An unknown error occurred';
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#ff0000')
                        .setTitle('Error Logging DoPR Event')
                        .setDescription(`An error occurred while logging the event: \`${errorMessage}\``)
                        .setTimestamp()
                ]
            });
        }
    }
};
