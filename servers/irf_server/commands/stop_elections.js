const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Admin, Vote } = require('../../../DBModels/election'); // Adjust path as needed
const { logevent } = require('../../../permissions.json').irf;
const { interactionEmbed } = require('../../../functions');

module.exports = {
    name: 'stop_elections',
    description: 'Stop the current election and display results',
    data: new SlashCommandBuilder()
        .setName('stop_elections')
        .setDescription('Stop the current election and display results')
        .addBooleanOption(option =>
            option.setName('show_results')
                .setDescription('Show election results after stopping')
                .setRequired(false)
        ),
    run: async(client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasRole) {
             return interactionEmbed(3, "[ERR-UPRM]", 'Not proper permissions', interaction, client, [true, 30]);
             }
             
            const showResults = interaction.options.getBoolean('show_results') ?? true;

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

            let responseContent = `✅ **Election has been stopped successfully!**\n\n`;

            if (showResults) {
                // Get all votes for this election (no phase filtering)
                const votes = await Vote.find({ guildId: interaction.guild.id });

                if (votes.length === 0) {
                    responseContent += '📊 **Results:** No votes were cast in this election.';
                } else {
                    // Count votes by candidate
                    const voteCount = {};
                    votes.forEach(vote => {
                        const key = `${vote.candidateName} - ${vote.party}`;
                        voteCount[key] = (voteCount[key] || 0) + 1;
                    });

                    // Sort candidates by vote count
                    const sortedResults = Object.entries(voteCount)
                        .sort(([,a], [,b]) => b - a)
                        .map(([candidate, count], index) => ({
                            position: index + 1,
                            candidate,
                            votes: count
                        }));

                    // Create results embed
                    const resultsEmbed = new EmbedBuilder()
                        .setTitle(`📊 Election Results`)
                        .setColor('#ffd700')
                        .setDescription(`**Total Votes Cast:** ${votes.length}`)
                        .addFields(
                            {
                                name: '🏆 Results',
                                value: sortedResults.map(result => 
                                    `**${result.position}.** ${result.candidate} - **${result.votes}** vote${result.votes !== 1 ? 's' : ''}`
                                ).join('\n'),
                                inline: false
                            }
                        )
                        .setFooter({ text: 'Election System | Results' })
                        .setTimestamp();

                    // Send results to the announcement channel if it exists
                    if (adminDoc.announcementChannel) {
                        try {
                            const channel = await client.channels.fetch(adminDoc.announcementChannel);
                            if (channel) {
                                const announcementEmbed = new EmbedBuilder()
                                    .setTitle(`🔒 Election - CLOSED`)
                                    .setColor('#ff0000')
                                    .setDescription(`**Elections have ended!**\n\nThank you to everyone who participated.`)
                                    .setTimestamp();

                                await channel.send({ embeds: [announcementEmbed, resultsEmbed] });
                            }
                        } catch (error) {
                            console.error('Error sending results to announcement channel:', error);
                        }
                    }

                    // Reply with results
                    await interaction.editReply({
                        content: responseContent,
                        embeds: [resultsEmbed],
                        ephemeral: true
                    });
                    return;
                }
            }

            // Send closure announcement if no results shown
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
                content: responseContent,
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