const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Admin, Vote } = require('../../../DBModels/election'); // Adjust path as needed
const { logevent } = require('../../../permissions.json').irf;
const { interactionEmbed } = require('../../../functions');

module.exports = {
    name: 'stop_elections',
    description: 'Stop the current election',
    data: new SlashCommandBuilder()
        .setName('stop_elections')
        .setDescription('Stop the current election'),
    run: async(client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasRole) {
             return interactionEmbed(3, "[ERR-UPRM]", 'Not proper permissions', interaction, client, [true, 30]);
             }

            // Check if user has admin permissions
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.editReply({
                    content: '❌ You need Administrator permissions to use this command.',
                    ephemeral: true
                });
            }

            // Get admin document
            const adminDoc = await Admin.findOne();
            if (!adminDoc) {
                return await interaction.editReply({
                    content: '❌ Election system is not initialized.',
                    ephemeral: true
                });
            }

            // Check if elections are active
            if (!adminDoc.isElectionActive) {
                return await interaction.editReply({
                    content: '❌ No elections are currently active.',
                    ephemeral: true
                });
            }

            // Stop the election
            adminDoc.isElectionActive = false;
            await adminDoc.save();

            // Send closure announcement
            if (adminDoc.announcementChannel) {
                try {
                    const channel = await client.channels.fetch(adminDoc.announcementChannel);
                    if (channel) {
                        const announcementEmbed = new EmbedBuilder()
                            .setTitle(`🔒 Election - CLOSED`)
                            .setColor('#ff0000')
                            .setDescription(`**Elections have ended!**\n\nThank you to everyone who participated.`)
                            .setTimestamp();

                        await channel.send({ embeds: [announcementEmbed] });
                    }
                } catch (error) {
                    console.error('Error sending closure announcement:', error);
                }
            }

            await interaction.editReply({
                content: `✅ **Election has been stopped successfully!**`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in stop_elections command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while stopping the election. Please try again later.',
                ephemeral: true
            });
        }
    }
};