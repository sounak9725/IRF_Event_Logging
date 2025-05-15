/* eslint-disable no-unused-vars */
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder, MessageFlags } = require('discord.js');
const axios = require('axios'); // Import axios for API calls
const PasswordModel = require('../../../DBModels/Password'); // Import the password model
const { interactionEmbed } = require('../../../functions');

module.exports = {
    name: 'generate_password_boe',
    description: 'Generate the password section in the Google Form with a new password.',
    data: new SlashCommandBuilder()
        .setName('generate_password_boe')
        .setDescription('Updates the password section in the Google Form with a new password'),

    /**
     * @param {Client} client
     * @param {CommandInteraction} interaction
     */
    run: async (client, interaction) => {
        try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            const oaexam = ["1368940465402937344 ", "1115380276147798096"];
            const hasRole = oaexam.some(roleId => interaction.member.roles.cache.has(roleId));
            if (!hasRole) {
                return interactionEmbed(3, "[ERR-UPRM]", '', interaction, client, [true, 30]);
            }

            // Google Apps Script Web App URL (Replace with your actual deployment URL)
            const scriptUrl = "https://script.google.com/macros/s/AKfycbyARIDRVc0Zpikk6cp-WpbRf12zDiyzyuLPu4SW94OWck5e2Ew6cVtmnXrVMah5k52B1w/exec";

            // Call the Google Apps Script to update password validation
            const response = await axios.get(scriptUrl, { responseType: 'text' });
            console.log("Google Apps Script Response:", response.data); // Log the response from the script
            const newPassword = response.data.trim();

            if (!newPassword || newPassword.startsWith("<!DOCTYPE html>")) {
                return interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor("#FF0000")
                            .setTitle("❌ Password Update Failed")
                            .setDescription("Failed to update the password. Please try again.")
                    ],
                    ephemeral: true
                });
            }

            // Update password in MongoDB
            await PasswordModel.findOneAndUpdate({}, { password: newPassword }, { upsert: true, new: true });
            
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#00FF00")
                        .setTitle("✅ Password Updated Successfully")
                        .setDescription(`New password: **${newPassword}**`)
                ],
                ephemeral: true
            });
        } catch (error) {
            console.error("Error updating password via script:", error.response ? error.response.data : error.message);
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor("#FF0000")
                        .setTitle("❌ Password Update Failed")
                        .setDescription("An error occurred while updating the password. Please check the logs for details.")
                ],
                ephemeral: true
            });
        }
    },
};
