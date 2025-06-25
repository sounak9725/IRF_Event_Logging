const { SlashCommandBuilder, EmbedBuilder, Client, CommandInteraction, MessageFlags } = require('discord.js');
const Event = require('../../../DBModels/Events');
const { getRowifi } = require('../../../functions'); // Adjust path if needed

module.exports = {
    name: 'assign',
    description: 'Assign yourself as leader of a meeting/event',
    data: new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Assign yourself as leader of a meeting/event')
        .addStringOption(option =>
            option.setName('meeting_type')
                .setDescription('Type of meeting')
                .setRequired(true)
                .addChoices(
                    { name: 'Senate', value: 'Senate' },
                    { name: 'Duma', value: 'Duma' },
                    { name: 'Cabinet', value: 'Cabinet' },
                    { name: 'MHQ', value: 'MHQ' },
                    { name: 'Other (Inspection/Medal Ceremony)', value: 'Other' }
                ))
        .addStringOption(option =>
            option.setName('event_time')
                .setDescription('Event time in Discord timestamp format (e.g., <t:1234567890:F>)')
                .setRequired(true)),

    /**
     * @param {Client} client
     * @param {CommandInteraction} interaction
     */
    run: async (client, interaction) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Check permissions - adjust role names to match your server
        const allowedRoles = ['Royal Guard Officers', 'Senate', "Royal Guard NCO"];
        const hasPermission = interaction.member.roles.cache.some(role =>
            allowedRoles.includes(role.name)
        );

        if (!hasPermission) {
            return interaction.editReply({
                content: '❌ Only Officers and NCOs can assign themselves to events.',
                ephemeral: true
            });
        }

        // Get Roblox username using Rowifi
        const rowifiResult = await getRowifi(interaction.user.id, client);
        let robloxUsername = "Unknown";
        if (rowifiResult.success) {
            robloxUsername = rowifiResult.username;
        }

        const meetingType = interaction.options.getString('meeting_type');
        const eventTime = interaction.options.getString('event_time');

        // Validate timestamp format
        const timestampMatch = eventTime.match(/<t:(\d+):[FfDdTtRr]>/);
        if (!timestampMatch) {
            return interaction.editReply({
                content: '❌ Invalid timestamp format. Please use Discord timestamp format like `<t:1234567890:F>`',
                ephemeral: true
            });
        }

        const timestamp = parseInt(timestampMatch[1]);

        try {
            // Use findOneAndUpdate with upsert to replace existing event or create new one
            const event = await Event.findOneAndUpdate(
                {
                    guildId: interaction.guild.id,
                    eventType: meetingType
                },
                {
                    leader: robloxUsername,
                    leaderId: interaction.member.id,
                    timestamp: timestamp,
                    timestampStr: eventTime,
                    assignedBy: interaction.user.id,
                    assignedAt: new Date()
                },
                {
                    upsert: true,
                    new: true
                }
            );

            const assignEmbed = new EmbedBuilder()
                .setColor(0x00FF00)
                .setTitle('✅ Event Assignment Successful')
                .addFields(
                    { name: 'Event Type', value: meetingType, inline: true },
                    { name: 'Leader (Roblox)', value: robloxUsername, inline: true },
                    { name: 'Scheduled Time', value: eventTime, inline: false }
                )
                .setFooter({ text: `Assigned by ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.editReply({ embeds: [assignEmbed] });

        } catch (error) {
            console.error('Error assigning event:', error);
            await interaction.editReply({
                content: '❌ An error occurred while assigning the event. Please try again.',
                ephemeral: true
            });
        }
    },
};