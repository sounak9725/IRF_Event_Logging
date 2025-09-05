const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { metrics } = require('../../../utils/metrics');
const { HealthCheck } = require('../../../utils/healthCheck');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('health')
    .setDescription('Check bot health status and performance metrics')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of health information to display')
        .setRequired(false)
        .addChoices(
          { name: 'Overview', value: 'overview' },
          { name: 'Performance', value: 'performance' },
          { name: 'Commands', value: 'commands' },
          { name: 'Errors', value: 'errors' }
        )
    ),

  async run(client, interaction) {
    await interaction.deferReply({ ephemeral: true });

    const type = interaction.options.getString('type') || 'overview';

    try {
      switch (type) {
        case 'overview':
          await this.showOverview(client, interaction);
          break;
        case 'performance':
          await this.showPerformance(client, interaction);
          break;
        case 'commands':
          await this.showCommands(client, interaction);
          break;
        case 'errors':
          await this.showErrors(client, interaction);
          break;
      }
    } catch (error) {
      console.error('Error in health command:', error);
      await interaction.editReply({
        content: 'An error occurred while fetching health information.',
        ephemeral: true
      });
    }
  },

  async showOverview(client, interaction) {
    // Get health check instance from client or create temporary one
    const healthCheck = client.healthCheck || new HealthCheck(client);
    const healthReport = await healthCheck.runAllChecks();
    const performanceMetrics = metrics.getPerformanceMetrics();

    const embed = new EmbedBuilder()
      .setTitle('🏥 Bot Health Overview')
      .setColor(healthReport.overallStatus === 'healthy' ? 0x00ff00 : 
                healthReport.overallStatus === 'degraded' ? 0xffff00 : 0xff0000)
      .setTimestamp();

    // Overall status
    const statusEmojis = { healthy: '🟢', degraded: '🟡', unhealthy: '🔴' };
    embed.addFields({
      name: 'Overall Status',
      value: `${statusEmojis[healthReport.overallStatus]} ${healthReport.overallStatus.toUpperCase()}`,
      inline: true
    });

    // Key metrics
    embed.addFields(
      {
        name: 'Uptime',
        value: performanceMetrics.uptimeFormatted,
        inline: true
      },
      {
        name: 'Commands Executed',
        value: performanceMetrics.commandsExecuted.toString(),
        inline: true
      },
      {
        name: 'Memory Usage',
        value: performanceMetrics.memoryUsage.heapUsed,
        inline: true
      },
      {
        name: 'Error Rate',
        value: performanceMetrics.errorRate,
        inline: true
      },
      {
        name: 'WebSocket Ping',
        value: `${client.ws.ping}ms`,
        inline: true
      }
    );

    // Health checks summary
    const healthSummary = Object.entries(healthReport.checks)
      .map(([name, check]) => `${statusEmojis[check.status]} **${name}**: ${check.message}`)
      .join('\n');

    embed.addFields({
      name: 'System Checks',
      value: healthSummary || 'No checks available',
      inline: false
    });

    await interaction.editReply({ embeds: [embed] });
  },

  async showPerformance(client, interaction) {
    const performanceMetrics = metrics.getPerformanceMetrics();
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Performance Metrics')
      .setColor(0x00ffff)
      .setTimestamp();

    embed.addFields(
      {
        name: 'Runtime Statistics',
        value: `**Uptime:** ${performanceMetrics.uptimeFormatted}\n**Commands Executed:** ${performanceMetrics.commandsExecuted}\n**Errors Encountered:** ${performanceMetrics.errorsEncountered}\n**Error Rate:** ${performanceMetrics.errorRate}`,
        inline: true
      },
      {
        name: 'Memory Usage',
        value: `**Heap Used:** ${performanceMetrics.memoryUsage.heapUsed}\n**Heap Total:** ${performanceMetrics.memoryUsage.heapTotal}\n**External:** ${performanceMetrics.memoryUsage.external}`,
        inline: true
      },
      {
        name: 'Network',
        value: `**WebSocket Ping:** ${client.ws.ping}ms\n**Guilds:** ${client.guilds.cache.size}\n**Users:** ${client.users.cache.size}`,
        inline: true
      }
    );

    // Memory peaks
    if (performanceMetrics.memoryPeaks.length > 0) {
      const peaks = performanceMetrics.memoryPeaks
        .slice(-3)
        .map(peak => `${peak.heapUsed}MB at ${new Date(peak.timestamp).toLocaleTimeString()}`)
        .join('\n');
      
      embed.addFields({
        name: 'Recent Memory Peaks',
        value: peaks,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },

  async showCommands(client, interaction) {
    const commandStats = metrics.getCommandStats();
    
    const embed = new EmbedBuilder()
      .setTitle('⚡ Command Usage Statistics')
      .setColor(0x5865f2)
      .setTimestamp();

    if (Object.keys(commandStats).length === 0) {
      embed.setDescription('No command usage data available yet.');
      return await interaction.editReply({ embeds: [embed] });
    }

    // Top 10 most used commands
    const topCommands = Object.entries(commandStats)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 10)
      .map(([name, stats]) => 
        `**${name}**: ${stats.count} uses (${stats.averageTime.toFixed(1)}ms avg, ${stats.uniqueUsers} users)`
      )
      .join('\n');

    embed.addFields({
      name: 'Most Used Commands',
      value: topCommands || 'No data available',
      inline: false
    });

    // Performance insights
    const slowCommands = Object.entries(commandStats)
      .filter(([,stats]) => stats.averageTime > 1000)
      .sort(([,a], [,b]) => b.averageTime - a.averageTime)
      .slice(0, 5)
      .map(([name, stats]) => `**${name}**: ${stats.averageTime.toFixed(1)}ms avg`)
      .join('\n');

    if (slowCommands) {
      embed.addFields({
        name: 'Slowest Commands (>1s)',
        value: slowCommands,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  },

  async showErrors(client, interaction) {
    const errorStats = metrics.getErrorStats();
    
    const embed = new EmbedBuilder()
      .setTitle('🚨 Error Statistics')
      .setColor(0xff4444)
      .setTimestamp();

    if (Object.keys(errorStats).length === 0) {
      embed.setDescription('No errors recorded yet. 🎉');
      return await interaction.editReply({ embeds: [embed] });
    }

    // Top error types
    const topErrors = Object.entries(errorStats)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 10)
      .map(([type, stats]) => 
        `**${type}**: ${stats.count} occurrences\n*Last: ${stats.lastOccurrence ? new Date(stats.lastOccurrence).toLocaleString() : 'Unknown'}*`
      )
      .join('\n\n');

    embed.addFields({
      name: 'Error Types',
      value: topErrors || 'No errors recorded',
      inline: false
    });

    // Recent error contexts (for debugging)
    const recentErrors = Object.entries(errorStats)
      .filter(([,stats]) => stats.recentContexts && stats.recentContexts.length > 0)
      .slice(0, 3)
      .map(([type, stats]) => {
        const context = stats.recentContexts[0];
        return `**${type}**: ${context.message.substring(0, 100)}${context.message.length > 100 ? '...' : ''}`;
      })
      .join('\n');

    if (recentErrors) {
      embed.addFields({
        name: 'Recent Error Details',
        value: recentErrors,
        inline: false
      });
    }

    await interaction.editReply({ embeds: [embed] });
  }
};
