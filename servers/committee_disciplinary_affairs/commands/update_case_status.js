/* eslint-disable no-undef */
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder } = require('discord.js');
const { getMPDisciplineCaseModel } = require('../../../DBModels/mpDiscipline');
const { interactionEmbed } = require('../../../functions');

module.exports = {
    name: 'update_case_status',
    description: 'Update the status of an MP discipline case',
    data: new SlashCommandBuilder()
        .setName('update_case_status')
        .setDescription('Update case status')
        .addStringOption(option =>
            option.setName('case_id')
                .setDescription('The _id of the case to update')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('new_status')
                .setDescription('New status for the case')
                .setRequired(true)
                .addChoices(
                    { name: 'Active', value: 'Active' },
                    { name: 'Pending', value: 'Pending' },
                    { name: 'Resolved', value: 'Resolved' },
                    { name: 'Archived', value: 'Archived' }
                ))
        .addStringOption(option =>
            option.setName('details')
                .setDescription('Additional details or notes about the status change')
                .setRequired(false)),
    /**
     * @param {Client} client
     * @param {CommandInteraction} interaction
     */
    run: async (client, interaction) => {
        await interaction.deferReply();
        
        try {
            // Get the MP Discipline model using the separate connection
            const MPDisciplineCase = getMPDisciplineCaseModel(client.mpDisciplineConnection);
            
            const caseId = interaction.options.getString('case_id');
            const newStatus = interaction.options.getString('new_status');
            const details = interaction.options.getString('details');
            
            // Find and update the case
            const updatedCase = await MPDisciplineCase.findByIdAndUpdate(
                caseId,
                {
                    status: newStatus,
                    updatedAt: new Date(),
                    ...(details && { details: details })
                },
                { new: true }
            );
            
            if (!updatedCase) {
                const notFoundEmbed = new EmbedBuilder()
                    .setTitle('❌ Case Not Found')
                    .setDescription(`No case found with ID: ${caseId}`)
                    .setColor('#FF0000')
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [notFoundEmbed] });
            }
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ Case Status Updated')
                .setDescription('MP discipline case status has been updated successfully.')
                .setColor('#00FF00')
                .addFields(
                    {
                        name: 'Case ID',
                        value: caseId,
                        inline: true
                    },
                    {
                        name: 'Offender',
                        value: updatedCase.offender,
                        inline: true
                    },
                    {
                        name: 'Previous Status',
                        value: updatedCase.status,
                        inline: true
                    },
                    {
                        name: 'New Status',
                        value: newStatus,
                        inline: true
                    },
                    {
                        name: 'Updated By',
                        value: interaction.user.username,
                        inline: true
                    },
                    {
                        name: 'Updated At',
                        value: `<t:${Math.floor(new Date().getTime() / 1000)}:R>`,
                        inline: true
                    }
                )
                .setFooter({ text: `Committee Disciplinary Affairs | Case Management` })
                .setTimestamp();
            
            if (details) {
                successEmbed.addFields({
                    name: 'Additional Details',
                    value: details,
                    inline: false
                });
            }
            
            await interaction.editReply({ embeds: [successEmbed] });
            
        } catch (error) {
            console.error('Error updating case status:', error);
            return interactionEmbed(3, "[ERR-UPDATE-STATUS]", 'An error occurred while updating the case status.', interaction, client, [true, 30]);
        }
    }
};
