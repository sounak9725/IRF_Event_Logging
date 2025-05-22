/* eslint-disable no-undef */
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'ping_2sa',
    description: 'Shows the bot\'s latency information.',
    data: new SlashCommandBuilder()
        .setName('ping_2sa')
        .setDescription('Displays the bot\'s latency statistics.'),
   /**
   * @param {Client} client
   * @param {CommandInteraction} interaction
   */
    run: async (client, interaction) => {
        // Defer the reply to ensure we have time to measure
        await interaction.deferReply();
        
        // Start timer for websocket latency measurement
        const startTime = Date.now();
        
        // First test message
        await interaction.editReply({ content: 'Testing ping... [1/2]' });
        
        // Second test message
        await interaction.editReply({ content: 'Testing ping... [2/2]' });
        
        // Calculate websocket latency (round trip time)
        const websocketLatency = Date.now() - startTime;
        
        // Get API latency
        const apiLatency = Math.round(client.ws.ping);
        
        // Quality indicators
        const getQualityIndicator = (latency) => {
            if (latency < 100) return '🟢 Excellent';
            if (latency < 200) return '🟢 Good';
            if (latency < 400) return '🟡 Average';
            if (latency < 600) return '🟠 Slow';
            return '🔴 Poor';
        };
        
        // Create an embed for better formatting
        const pingEmbed = new EmbedBuilder()
            .setTitle('📊 Latency Test Results')
            .setColor(websocketLatency > 400 || apiLatency > 400 ? '#FF9900' : '#00CC66')
            .addFields(
                { 
                    name: 'WebSocket Latency', 
                    value: `${websocketLatency}ms (${getQualityIndicator(websocketLatency)})`,
                    inline: true
                },
                { 
                    name: 'API Latency', 
                    value: `${apiLatency}ms (${getQualityIndicator(apiLatency)})`,
                    inline: true 
                }
            )
            .setFooter({ text: 'Maintained by suman9725' })
            .setTimestamp();
        
        // Send the final embed
        await interaction.editReply({ content: null, embeds: [pingEmbed] });
    }
};