const { SlashCommandBuilder, EmbedBuilder, Client, CommandInteraction, MessageFlags } = require('discord.js');
const Event = require('../../../DBModels/Events'); // Adjust path as needed

module.exports = {
    name: 'viewirfevents',
    description: 'View all active events',
    data: new SlashCommandBuilder()
        .setName('viewirfevents')
        .setDescription('View all active events'),

    /**
     * @param {Client} client
     * @param {CommandInteraction} interaction
     */
    run: async (client, interaction) => {

        await interaction.deferReply({ ephemeral: false });

        try {
            const events = await Event.find({
                guildId: interaction.guild.id
            }).sort({ eventType: 1 });

            if (events.length === 0) {
                return interaction.editReply({
                    content: '❌ No active events found in this server.',
                    ephemeral: true
                });
            }

            const viewEmbed = new EmbedBuilder()
                .setColor(0xFF9900)
                .setTitle('📋 All Active IRF Events')
                .setFooter({ text: 'IRF Event Management System' })
                .setTimestamp();

            // Add fields for each active event
            events.forEach(event => {
                viewEmbed.addFields({
                    name: `${event.eventType} Meeting`,
                    value: `**Leader:** ${event.leader}\n**Time:** ${event.timestampStr}\n**Countdown:** <t:${event.timestamp}:R>`,
                    inline: true
                });
            });

            // Add empty field for better formatting if odd number of events
            if (events.length % 2 === 1) {
                viewEmbed.addFields({ name: '\u200B', value: '\u200B', inline: true });
            }

            await interaction.editReply({ embeds: [viewEmbed] });

        } catch (error) {
            console.error('Error fetching events:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching events.',
                ephemeral: true
            });
        }
    },
};