const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Admin, Vote, Participation } = require('../../../DBModels/election'); // Adjust path as needed
const { logevent } = require('../../../permissions.json').fs;


module.exports = {
    name: 'election_results',
    description: 'View election results for the current or last election',
    data: new SlashCommandBuilder()
        .setName('election_results')
        .setDescription('View election results for the current or last election')
        .addBooleanOption(option =>
            option.setName('detailed')
                .setDescription('Show detailed results with voter information')
                .setRequired(false)
        ),

    run: async(client, interaction) =>{
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

            const detailed = interaction.options.getBoolean('detailed') || false;

            // Get admin document
            const adminDoc = await Admin.findOne();
            if (!adminDoc) {
                return await interaction.editReply({
                    content: '❌ Election system is not initialized.',
                    ephemeral: true
                });
            }

            // Get all votes for this guild (current or last election)
            const votes = await Vote.find({ guildId: interaction.guild.id });

            if (votes.length === 0) {
                return await interaction.editReply({
                    content: `❌ No votes found for this election.`,
                    ephemeral: true
                });
            }

            // Count votes by candidate
            const voteCount = {};
            const voterDetails = {};

            votes.forEach(vote => {
                const key = `${vote.candidateName} - ${vote.party}`;
                voteCount[key] = (voteCount[key] || 0) + 1;
                
                if (detailed) {
                    if (!voterDetails[key]) voterDetails[key] = [];
                    voterDetails[key].push({
                        username: vote.username,
                        votedAt: vote.votedAt
                    });
                }
            });

            // Sort candidates by vote count
            const sortedResults = Object.entries(voteCount)
                .sort(([,a], [,b]) => b - a)
                .map(([candidate, count], index) => ({
                    position: index + 1,
                    candidate,
                    votes: count,
                    percentage: ((count / votes.length) * 100).toFixed(1)
                }));

            // Create main results embed
            const resultsEmbed = new EmbedBuilder()
                .setTitle(`📊 Election Results`)
                .setColor('#ffd700')
                .setDescription(`**Total Votes Cast:** ${votes.length}`)
                .addFields(
                    {
                        name: '🏆 Results',
                        value: sortedResults.map(result => 
                            `**${result.position}.** ${result.candidate}\n` +
                            `   📊 **${result.votes}** votes (${result.percentage}%)`
                        ).join('\n\n'),
                        inline: false
                    }
                );

            // Add winner information
            if (sortedResults.length > 0) {
                const winner = sortedResults[0];
                resultsEmbed.addFields({
                    name: '👑 Winner',
                    value: `**${winner.candidate}** with ${winner.votes} votes (${winner.percentage}%)`,
                    inline: false
                });
            }

            // Add election status
            const now = new Date();
            let status = '🔴 Completed';
            if (adminDoc.isElectionActive && adminDoc.electionStart && adminDoc.electionDurationHours) {
                const end = new Date(adminDoc.electionStart);
                end.setHours(end.getHours() + adminDoc.electionDurationHours);
                if (now >= adminDoc.electionStart && now <= end) status = '🟢 Active';
            }
            resultsEmbed.addFields({
                name: '📈 Election Status',
                value: status,
                inline: true
            });

            // Add timestamp
            resultsEmbed.setFooter({ text: 'Election System | Results' })
                .setTimestamp();

            const embeds = [resultsEmbed];

            // Add detailed results if requested
            if (detailed && sortedResults.length > 0) {
                const detailedEmbed = new EmbedBuilder()
                    .setTitle(`📋 Detailed Results`)
                    .setColor('#00bfff')
                    .setDescription('Voter information for each candidate');

                sortedResults.forEach(result => {
                    const voters = voterDetails[result.candidate];
                    if (voters && voters.length > 0) {
                        const voterList = voters
                            .sort((a, b) => new Date(a.votedAt) - new Date(b.votedAt))
                            .map((voter, index) => 
                                `${index + 1}. **${voter.username}** - <t:${Math.floor(new Date(voter.votedAt).getTime() / 1000)}:R>`
                            )
                            .join('\n');

                        detailedEmbed.addFields({
                            name: `${result.candidate} (${result.votes} votes)`,
                            value: voterList.length > 1024 ? 
                                voterList.substring(0, 1000) + '...\n*List truncated*' : 
                                voterList,
                            inline: false
                        });
                    }
                });

                embeds.push(detailedEmbed);
            }

            // Add statistics embed
            const statsEmbed = new EmbedBuilder()
                .setTitle(`📈 Statistics`)
                .setColor('#32cd32');

            // Get participation statistics
            const totalParticipants = await Participation.countDocuments({ guildId: interaction.guild.id });

            // Calculate voting time statistics
            const votingTimes = votes.map(v => new Date(v.votedAt)).sort((a, b) => a - b);
            const firstVote = votingTimes[0];
            const lastVote = votingTimes[votingTimes.length - 1];

            statsEmbed.addFields(
                {
                    name: '📊 Voting Statistics',
                    value: `**Total Participants:** ${totalParticipants}\n` +
                           `**Candidates:** ${Object.keys(voteCount).length}\n` +
                           `**Parties Represented:** ${new Set(votes.map(v => v.party)).size}`,
                    inline: true
                },
                {
                    name: '⏰ Timing',
                    value: `**First Vote:** <t:${Math.floor(firstVote.getTime() / 1000)}:R>\n` +
                           `**Last Vote:** <t:${Math.floor(lastVote.getTime() / 1000)}:R>\n` +
                           `**Duration:** ${Math.round((lastVote - firstVote) / (1000 * 60))} minutes`,
                    inline: true
                }
            );

            embeds.push(statsEmbed);

            await interaction.editReply({
                embeds: embeds,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error in election_results command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching election results. Please try again later.',
                ephemeral: true
            });
        }
    }
};