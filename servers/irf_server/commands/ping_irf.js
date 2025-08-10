/* eslint-disable no-undef */
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'ping_irf',
    description: 'Shows the bot\'s latency information.',
    data: new SlashCommandBuilder()
        .setName('ping_irf')
        .setDescription('Displays the bot\'s latency statistics.'),
   /**
   * @param {Client} client
   * @param {CommandInteraction} interaction
   */
    run: async (client, interaction) => {
        // Defer the reply to ensure we have time to measure
        const deferStart = Date.now();
        await interaction.deferReply();
        const deferTime = Date.now() - deferStart;
        
        // Get API latency (this is the actual WebSocket heartbeat)
        const apiLatency = Math.round(client.ws.ping);
        
        // Measure round-trip time for a simple operation
        const rttStart = Date.now();
        await interaction.editReply({ content: 'Measuring latency...' });
        const rttTime = Date.now() - rttStart;
        
        // Get additional performance metrics
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();
        
        // Quality indicators
        const getQualityIndicator = (latency) => {
            if (latency < 50) return '🟢 Excellent';
            if (latency < 100) return '🟢 Good';
            if (latency < 200) return '🟡 Average';
            if (latency < 400) return '🟠 Slow';
            return '🔴 Poor';
        };
        
        // Create an embed for better formatting
        const pingEmbed = new EmbedBuilder()
            .setTitle('📊 Latency & Performance Test Results')
            .setColor(apiLatency > 200 || rttTime > 500 ? '#FF9900' : '#00CC66')
            .addFields(
                { 
                    name: 'WebSocket Heartbeat', 
                    value: `${apiLatency}ms (${getQualityIndicator(apiLatency)})`,
                    inline: true
                },
                { 
                    name: 'Round-Trip Time', 
                    value: `${rttTime}ms (${getQualityIndicator(rttTime)})`,
                    inline: true 
                },
                {
                    name: 'Defer Time',
                    value: `${deferTime}ms`,
                    inline: true
                },
                {
                    name: 'Memory Usage',
                    value: `RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB\nHeap: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
                    inline: true
                },
                {
                    name: 'Uptime',
                    value: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
                    inline: true
                },
                {
                    name: 'Guilds Connected',
                    value: `${client.guilds.cache.size}`,
                    inline: true
                }
            )
            .setFooter({ text: 'Maintained by suman9725' })
            .setTimestamp();
        
        // Send the final embed
        await interaction.editReply({ content: null, embeds: [pingEmbed] });
    }
};