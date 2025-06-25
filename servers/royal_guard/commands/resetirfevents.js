const { SlashCommandBuilder, EmbedBuilder, Client, CommandInteraction, MessageFlags } = require('discord.js');
const Event = require('../../../DBModels/Events'); // Adjust path as needed

module.exports = {
    name: 'resetirfevent',
    description: 'Reset/clear a specific event (Officers/NCOs only)',
    data: new SlashCommandBuilder()
        .setName('resetirfevent')
        .setDescription('Reset/clear a specific event (Officers/NCOs only)')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of meeting to reset')
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

        // Check permissions - adjust role names to match your server
        const allowedRoles = ['Royal Guard Officers', 'High Command', 'Senate'];
        const hasPermission = interaction.member.roles.cache.some(role => 
            allowedRoles.includes(role.name)
        );

        if (!hasPermission) {
            return interaction.reply({
                content: '❌ Only Officers and NCOs can reset events.',
                ephemeral: true
            });
        }

        const typeToReset = interaction.options.getString('type');
        
        try {
            const event = await Event.findOneAndDelete({
                guildId: interaction.guild.id,
                eventType: typeToReset
            });

            if (!event) {
                return interaction.editReply({
                    content: `❌ No active ${typeToReset} event found to reset.`,
                    ephemeral: true
                });
            }

            const resetEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🗑️ Event Reset Successful')
                .addFields(
                    { name: 'Event Type', value: typeToReset, inline: true },
                    { name: 'Previous Leader', value: event.leader, inline: true },
                    { name: 'Reset By', value: interaction.user.tag, inline: true }
                )
                .setFooter({ text: 'IRF Event Management System' })
                .setTimestamp();

            await interaction.editReply({ embeds: [resetEmbed] });

        } catch (error) {
            console.error('Error resetting event:', error);
            await interaction.editReply({
                content: '❌ An error occurred while resetting the event.',
                ephemeral: true
            });
        }
    },
};