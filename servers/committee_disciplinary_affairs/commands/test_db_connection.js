/* eslint-disable no-undef */
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder } = require('discord.js');
const { getMPDisciplineCaseModel } = require('../../../DBModels/mpDiscipline');
const { interactionEmbed } = require('../../../functions');

module.exports = {
    name: 'test_db_connection',
    description: 'Test the MP discipline database connection',
    data: new SlashCommandBuilder()
        .setName('test_db_connection')
        .setDescription('Test connection to MP discipline database'),
    /**
     * @param {Client} client
     * @param {CommandInteraction} interaction
     */
    run: async (client, interaction) => {
        await interaction.deferReply();
        
        try {
            const testEmbed = new EmbedBuilder()
                .setTitle('Database Connection Test')
                .setDescription('Testing MP Discipline database connection...')
                .setColor('#FFA500')
                .setTimestamp();
            
            await interaction.editReply({ embeds: [testEmbed] });
            
            // Check if connection exists
            if (!client.mpDisciplineConnection) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Connection Test Failed')
                    .setDescription('MP Discipline database connection not available.')
                    .setColor('#FF0000')
                    .addFields({
                        name: 'Status',
                        value: '🔴 Not Connected',
                        inline: true
                    })
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [errorEmbed] });
            }
            
            // Test the connection
            const connectionState = client.mpDisciplineConnection.readyState;
            const connectionStatus = {
                0: '🔴 Disconnected',
                1: '🟢 Connected',
                2: '🟡 Connecting',
                3: '🟠 Disconnecting'
            };
            
            // Try to get a model and count documents
            let documentCount = 0;
            let modelTest = false;
            
            try {
                const MPDisciplineCase = getMPDisciplineCaseModel(client.mpDisciplineConnection);
                documentCount = await MPDisciplineCase.countDocuments();
                modelTest = true;
            } catch (modelError) {
                console.error('Model test failed:', modelError);
            }
            
            const resultEmbed = new EmbedBuilder()
                .setTitle('✅ Connection Test Results')
                .setDescription('MP Discipline database connection test completed.')
                .setColor('#00FF00')
                .addFields(
                    {
                        name: 'Connection Status',
                        value: connectionStatus[connectionState] || '❓ Unknown',
                        inline: true
                    },
                    {
                        name: 'Model Test',
                        value: modelTest ? '✅ Passed' : '❌ Failed',
                        inline: true
                    },
                    {
                        name: 'Document Count',
                        value: modelTest ? documentCount.toString() : 'N/A',
                        inline: true
                    },
                    {
                        name: 'Database Info',
                        value: `Database: mp_discipline\nCollection: cases\nHost: ${client.mpDisciplineConnection.host || 'Unknown'}`,
                        inline: false
                    }
                )
                .setTimestamp();
            
            await interaction.editReply({ embeds: [resultEmbed] });
            
        } catch (error) {
            console.error('Error in database connection test:', error);
            return interactionEmbed(3, "[ERR-DB-TEST]", 'An error occurred while testing the database connection.', interaction, client, [true, 30]);
        }
    }
};
