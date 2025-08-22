const { SlashCommandBuilder, EmbedBuilder, MessageFlags, Client, CommandInteractionOptionResolver } = require('discord.js');
const { sheets } = require('../../../utils/googleSheetsAuth');
const { getRowifi, interactionEmbed } = require('../../../functions');
const { logevent } = require('../../../permissions.json').ga; // Assuming same permissions for ban logging
const axios = require('axios'); // Make sure to install: npm install axios


// Custom error class for better error handling
class LogBanError extends Error {
    constructor(message, code, details = null) {
        super(message);
        this.name = 'LogBanError';
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
    ROBLOX_API_ERROR: 'ERR-ROBLOX-API',
    USER_NOT_FOUND: 'ERR-USER-NOT-FOUND',
    UNKNOWN_ERROR: 'ERR-UNKNOWN'
};

// Spreadsheet configuration - UPDATE THESE VALUES TO MATCH YOUR BAN LOGGING SHEET
const SPREADSHEET_ID = '1aZ5ZUxJc_NMJx-x1L13jwaimmNf2T9kkP4Ar32G-CgU'; // Update with your ban sheet ID
const SHEET_NAME = 'Form Responses'; // Update with your ban sheet name
const START_ROW = 2; // Starting from row 2 (after headers)
const START_COLUMN = 'A'; // Starting from column A (Timestamp)

// Roblox API helper functions
class RobloxAPI {
    static async getUserByUsername(username) {
        try {
            const response = await axios.post('https://users.roblox.com/v1/usernames/users', {
                usernames: [username]
            });
            
            if (response.data && response.data.data && response.data.data.length > 0) {
                return {
                    success: true,
                    id: response.data.data[0].id,
                    username: response.data.data[0].name,
                    displayName: response.data.data[0].displayName
                };
            }
            
            return { success: false, error: 'User not found' };
        } catch (error) {
            console.error('Error fetching user by username:', error);
            return { success: false, error: error.message };
        }
    }

    static async getUserById(userId) {
        try {
            const response = await axios.get(`https://users.roblox.com/v1/users/${userId}`);
            
            if (response.data) {
                return {
                    success: true,
                    id: response.data.id,
                    username: response.data.name,
                    displayName: response.data.displayName
                };
            }
            
            return { success: false, error: 'User not found' };
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return { success: false, error: 'User not found' };
            }
            console.error('Error fetching user by ID:', error);
            return { success: false, error: error.message };
        }
    }

    static async resolveUser(input) {
        // Check if input is numeric (user ID)
        if (/^\d+$/.test(input)) {
            return await this.getUserById(input);
        } else {
            return await this.getUserByUsername(input);
        }
    }
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

// Helper function to find the next available row in column A
async function findNextAvailableRow() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!${START_COLUMN}${START_ROW}:${START_COLUMN}3000`
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
        throw new LogBanError(
            'Failed to find next available row',
            ERROR_CODES.SHEETS_ERROR,
            error.message
        );
    }
}

// date fucntion
function formatTimestamp(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); 
    const year = date.getFullYear();

    return `${year}-${month}-${day}`;
}

module.exports = {
    name: 'log_ban_ga',
    description: 'Log a ban to the tracking spreadsheet',
    data: new SlashCommandBuilder()
        .setName('log_ban_ga')
        .setDescription('Log a ban to the tracking spreadsheet')
        .addStringOption(option => 
            option.setName('offender')
                .setDescription('The Roblox username OR user ID of the offender')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('location')
                .setDescription('Location where the offense occurred')
                .setRequired(true)
                .addChoices(
                    { name: 'Papers', value: 'Papers' },
                    { name: 'Sevastopol', value: 'Sevastopol' }
                ))
        .addStringOption(option => 
            option.setName('ban_type')
                .setDescription('Type of ban issued')
                .setRequired(true)
                .addChoices(
                    { name: 'Server Ban', value: 'Server Ban' },
                    { name: 'Permanent Ban', value: 'Permanent Ban' }
                ))
        .addStringOption(option => 
            option.setName('infractions')
                .setDescription('Infractions committed by the user')
                .setRequired(true))
        .addStringOption(option => 
            option.setName('proof')
                .setDescription('Provide proof for the server or permanent ban (URL)')
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
            
            // Get Roblox username of the person logging the ban
            const rowifi = await getRowifi(interaction.user.id, client);
            if (!rowifi.success) throw new LogBanError('Unable to fetch your Roblox username.', ERROR_CODES.ROWIFI_ERROR, rowifi.error);
            
            // Get all input values
            const robloxUsername = rowifi.username; // Person logging the ban
            const offenderInput = interaction.options.getString('offender');
            const location = interaction.options.getString('location');
            const banType = interaction.options.getString('ban_type');
            const infractions = interaction.options.getString('infractions');
            const proof = interaction.options.getString('proof') || '';

            // Create timestamp in DD/MM/YYYY HH:mm:ss format
            const timestamp = formatTimestamp(new Date());
            console.log('Generated timestamp:', timestamp); // Debug log

            // Validate proof URL if provided
            if (proof && !proof.startsWith('http')) {
                throw new LogBanError(
                    'Invalid proof URL',
                    ERROR_CODES.VALIDATION_ERROR,
                    'Proof must be a valid URL starting with http or https'
                );
            }

            // Resolve offender information using Roblox API
            console.log('Resolving offender:', offenderInput);
            const offenderInfo = await RobloxAPI.resolveUser(offenderInput);
            
            if (!offenderInfo.success) {
                throw new LogBanError(
                    'Failed to find Roblox user',
                    ERROR_CODES.USER_NOT_FOUND,
                    `Could not find user: ${offenderInput}. Please check the username or user ID and try again.`
                );
            }

            console.log('Offender resolved:', offenderInfo);

            // Prepare row data based on your sheet structure (A to H)
            const rowData = [
                timestamp,                  // A - Timestamp
                robloxUsername,            // B - Roblox's Username (person logging)
                offenderInfo.username,     // C - Offender's Username
                offenderInfo.id.toString(), // D - Offender's ID
                location,                  // E - Location
                banType,                   // F - Type of Ban
                infractions,               // G - Infractions committed by the user
                proof                      // H - Proof
            ];

            // Find the next available row
            const nextRow = await findNextAvailableRow();
            console.log(`Next available row: ${nextRow}`);
            console.log('Row data to be written:', rowData); // Debug log

            // Write to the sheet (columns A to H)
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `${SHEET_NAME}!A${nextRow}:H${nextRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [rowData] }
            });

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setColor('#FF6B6B') // Red color for ban logging
                .setTitle('🔨 Ban Logged Successfully')
                .setDescription(`Ban for **${offenderInfo.username}** has been recorded.`)
                .addFields(
                    { name: 'Logged by', value: robloxUsername, inline: true },
                    { name: 'Offender', value: offenderInfo.username, inline: true },
                    { name: 'Offender ID', value: offenderInfo.id.toString(), inline: true },
                    { name: 'Display Name', value: offenderInfo.displayName || 'N/A', inline: true },
                    { name: 'Location', value: location, inline: true },
                    { name: 'Ban Type', value: banType, inline: true },
                    { name: 'Timestamp', value: timestamp, inline: false },
                    { name: 'Infractions', value: infractions, inline: false }
                );

            // Add proof field if provided
            if (proof) {
                successEmbed.addFields({ name: 'Proof', value: `[View Proof](${proof})`, inline: false });
            }

            await interaction.editReply({ embeds: [successEmbed] });

            const logsChannel = await client.channels.fetch('904278651745488907').catch(console.error);

            if (logsChannel && logsChannel.isTextBased()) {
    const publicLogEmbed = new EmbedBuilder()
        .setColor('#6C4EB6')
        .setTitle('Wide Ban Logs')
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/565/565547.png') // Optional icon
        .addFields(
            { name: "Roblox's Username", value: robloxUsername, inline: false },
            { name: "Offender's Username", value: offenderInfo.username, inline: false },
            { name: "Offender's ID", value: offenderInfo.id.toString(), inline: false },
            { name: "Location", value: `${location}.`, inline: false },
            { name: "Type of Ban", value: `${banType}.`, inline: false },
            { name: "Infractions committed by the user", value: infractions, inline: false },
        )
        .setFooter({ text: 'IRF – Wide Ban Logs • Today at ' + new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) });

    if (proof) {
        publicLogEmbed.addFields({ name: 'Proof:', value: proof });
    }

        await logsChannel.send({ embeds: [publicLogEmbed] });
    }

        } catch (error) {
            if (error instanceof LogBanError) {
                await handleError(interaction, error);
            } else {
                console.error('Error logging ban:', error);
                await handleError(interaction, new LogBanError(
                    'An unexpected error occurred',
                    ERROR_CODES.UNKNOWN_ERROR,
                    error.message
                ));
            }
        }
    }
};