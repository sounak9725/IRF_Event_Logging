const { SlashCommandBuilder, EmbedBuilder, Client, CommandInteraction, MessageFlags } = require('discord.js');
const Event = require('../../../DBModels/Events'); // Adjust path as needed

module.exports = {
    name: 'irfeventstatus',
    description: 'Check the status of a specific meeting/event',
    data: new SlashCommandBuilder()
        .setName('irfeventstatus')
        .setDescription('Check the status of a specific meeting/event')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of meeting to check')
                .setRequired(true)
                .addChoices(
                    { name: 'Senate', value: 'Senate' },
                    { name: 'Duma', value: 'Duma' },
                    { name: 'Cabinet', value: 'Cabinet' },
                    { name: 'MHQ', value: 'MHQ' },
                    { name: 'Other', value: 'Other' }
                )),

    /**
     * @param {Client} client
     * @param {CommandInteraction} interaction
     */
    run: async (client, interaction) => {

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const typeToCheck = interaction.options.getString('type');
        
        try {
            const event = await Event.findOne({
                guildId: interaction.guild.id,
                eventType: typeToCheck
            });

            if (!event) {
                return interaction.editReply({
                    content: `❌ No active ${typeToCheck} event found.`,
                    ephemeral: true
                });
            }

            const statusEmbed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle(`📅 ${typeToCheck} Event Status`)
                .addFields(
                    { name: 'Event Type', value: typeToCheck, inline: true },
                    { name: 'Leader', value: event.leader, inline: true },
                    { name: 'Scheduled Time', value: event.timestampStr, inline: false },
                    { name: 'Time Until Event', value: `<t:${event.timestamp}:R>`, inline: true }
                )
                .setFooter({ text: 'IRF Event Management System' })
                .setTimestamp();

            await interaction.editReply({ embeds: [statusEmbed] });

        } catch (error) {
            console.error('Error fetching event status:', error);
            await interaction.editReply({
                content: '❌ An error occurred while fetching the event status.',
                ephemeral: true
            });
        }
    },
};