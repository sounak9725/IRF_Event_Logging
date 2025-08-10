/* eslint-disable no-undef */
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder } = require('discord.js');
const requiredRoles = ['454082419922960385', '575665471592988672', '1049072890919800873', '450434193206411277', '660676336276340757', '1129468969779204209'];
const { interactionEmbed } = require('../../../functions');

module.exports = {
    name: 'performance',
    description: 'Shows detailed performance metrics.',
    data: new SlashCommandBuilder()
        .setName('performance')
        .setDescription('Displays detailed performance metrics and diagnostics.'),
   /**
   * @param {Client} client
   * @param {CommandInteraction} interaction
   */
    run: async (client, interaction) => {
        await interaction.deferReply();
        if (!interaction.member.roles.cache.some(role => requiredRoles.includes(role.id))) {
            return interactionEmbed(3, "[ERR-UPRM]", '', interaction, client, [true, 30]);
        }
        // Get performance metrics
        const wsLatency = client.ws.ping;
        const memoryUsage = process.memoryUsage();
        const uptime = process.uptime();
        const cpuUsage = process.cpuUsage();
        
        // Calculate memory efficiency
        const memoryEfficiency = ((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100).toFixed(2);
        
        // Get guild and user counts
        const guildCount = client.guilds.cache.size;
        const userCount = client.users.cache.size;
        const channelCount = client.channels.cache.size;
        
        // Performance status
        const getPerformanceStatus = () => {
            const issues = [];
            
            if (wsLatency > 200) issues.push('High WebSocket latency');
            if (memoryUsage.heapUsed > 100 * 1024 * 1024) issues.push('High memory usage');
            if (uptime < 3600) issues.push('Recent restart');
            
            if (issues.length === 0) return '🟢 Optimal';
            if (issues.length === 1) return '🟡 Minor Issues';
            return '🔴 Performance Issues';
        };
        
        // Create detailed performance embed
        const performanceEmbed = new EmbedBuilder()
            .setTitle('Performance Diagnostics')
            .setColor(getPerformanceStatus() === '🟢 Optimal' ? '#00CC66' : '#FF9900')
            .addFields(
                {
                    name: 'Overall Status',
                    value: getPerformanceStatus(),
                    inline: false
                },
                {
                    name: 'WebSocket',
                    value: `Latency: ${wsLatency}ms\nStatus: ${client.ws.status}`,
                    inline: true
                },
                {
                    name: 'Memory',
                    value: `Used: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB\nTotal: ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB\nEfficiency: ${memoryEfficiency}%`,
                    inline: true
                },
                {
                    name: 'System',
                    value: `Uptime: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m\nCPU: ${Math.round(cpuUsage.user / 1000)}ms user`,
                    inline: true
                },
                {
                    name: 'Bot Stats',
                    value: `Guilds: ${guildCount}\nUsers: ${userCount}\nChannels: ${channelCount}`,
                    inline: true
                },
                {
                    name: 'Connections',
                    value: `Database: ${client.mongoose?.connection?.readyState === 1 ? '🟢 Connected' : '🔴 Disconnected'}\nWebSocket: ${client.ws.status}`,
                    inline: true
                }
            )
            .setFooter({ text: 'Performance monitoring by suman9725 | 2025 | 2.1.0' })
            .setTimestamp();
        
        await interaction.editReply({ embeds: [performanceEmbed] });
    }
};
