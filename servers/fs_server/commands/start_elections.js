const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { Admin, Vote, Participation } = require('../../../DBModels/election'); // Adjust path as needed

module.exports = {
    name: 'start_elections',
    description: 'Start election for a specific phase',
    data: new SlashCommandBuilder()
        .setName('start_elections')
        .setDescription('Start an election for a set duration')
        .addIntegerOption(option =>
            option.setName('duration_hours')
                .setDescription('How many hours the election will last')
                .setRequired(true)
                .setMinValue(1)
        )
        .addChannelOption(option =>
            option.setName('announcement_channel')
                .setDescription('Channel to announce the election')
                .setRequired(false)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    run: async(client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });

            const durationHours = interaction.options.getInteger('duration_hours');
            const announcementChannel = interaction.options.getChannel('announcement_channel') || interaction.channel;

            // Check if user has admin permissions
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return await interaction.editReply({
                    content: '❌ You need Administrator permissions to use this command.',
                    ephemeral: true
                });
            }

            // Find or create admin document
            let adminDoc = await Admin.findOne();
            if (!adminDoc) {
                adminDoc = new Admin({
                    isElectionActive: true,
                    parties: [],
                    candidates: [],
                    announcementChannel: announcementChannel.id,
                    electionStart: new Date(),
                    electionDurationHours: durationHours
                });
            } else {
                adminDoc.isElectionActive = true;
                adminDoc.announcementChannel = announcementChannel.id;
                adminDoc.electionStart = new Date();
                adminDoc.electionDurationHours = durationHours;
            }

            await adminDoc.save();

            // Get all candidates (no phase filtering)
            const candidates = adminDoc.candidates;
            
            if (candidates.length === 0) {
                return await interaction.editReply({
                    content: `❌ No candidates found. Please add candidates first using the admin panel.`,
                    ephemeral: true
                });
            }

            // Create election announcement embed
            const electionEmbed = new EmbedBuilder()
                .setTitle(`🗳️ Election - Now Open!`)
                .setColor('#0099ff')
                .setDescription(`**Elections have begun!**\n\nUse \`/vote\` to cast your vote for your preferred candidate.\n\n**Voting will be open for ${durationHours} hour(s).**`)
                .addFields(
                    {
                        name: '📋 Available Candidates',
                        value: candidates.map(c => `• **${c.candidateName}** - ${c.party}`).join('\n') || 'No candidates available',
                        inline: false
                    },
                    {
                        name: '📝 How to Vote',
                        value: 'Use `/vote` command and select your candidate from the dropdown menu.',
                        inline: false
                    },
                    {
                        name: '⚠️ Important Notes',
                        value: '• You can only vote once per election\n• Your vote is final and cannot be changed',
                        inline: false
                    }
                )
                .setFooter({ text: 'Election System | Vote responsibly' })
                .setTimestamp();

            // Send announcement to the specified channel
            try {
                await announcementChannel.send({ embeds: [electionEmbed] });
                
                await interaction.editReply({
                    content: `✅ Election has been started successfully!\n📢 Announcement sent to ${announcementChannel}`,
                    ephemeral: true
                });
            } catch (error) {
                console.error('Error sending announcement:', error);
                await interaction.editReply({
                    content: `✅ Election has been started, but failed to send announcement. Please check channel permissions.`,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Error in start_elections command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while starting the election. Please try again later.',
                ephemeral: true
            });
        }
    }
};