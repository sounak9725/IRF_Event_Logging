/* eslint-disable no-undef */
const { SlashCommandBuilder, Client, CommandInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getMPDisciplineCaseModel } = require('../../../DBModels/mpDiscipline');
const { interactionEmbed } = require('../../../functions');

module.exports = {
    name: 'case_search',
    description: 'Search for MP discipline cases by various criteria',
    data: new SlashCommandBuilder()
        .setName('case_search')
        .setDescription('Search for MP discipline cases')
        .addSubcommand(subcommand =>
            subcommand
                .setName('by_offender')
                .setDescription('Search cases by offender username')
                .addStringOption(option =>
                    option.setName('username')
                        .setDescription('Username to search for')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('by_offender_id')
                .setDescription('Search cases by offender Discord ID')
                .addStringOption(option =>
                    option.setName('user_id')
                        .setDescription('Discord user ID to search for')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('by_case_id')
                .setDescription('Search for a specific case by its ID')
                .addStringOption(option =>
                    option.setName('case_id')
                        .setDescription('The case ID to search for')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('by_status')
                .setDescription('Search cases by status')
                .addStringOption(option =>
                    option.setName('status')
                        .setDescription('Case status to search for')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Active', value: 'Active' },
                            { name: 'Archived', value: 'Archived' },
                            { name: 'Pending', value: 'Pending' },
                            { name: 'Resolved', value: 'Resolved' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('recent')
                .setDescription('Show recent cases')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('Number of recent cases to show (max 10)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(10))),
    /**
     * @param {Client} client
     * @param {CommandInteraction} interaction
     */
    run: async (client, interaction) => {
        await interaction.deferReply();
        
        try {
            // Get the MP Discipline model using the separate connection
            const MPDisciplineCase = getMPDisciplineCaseModel(client.mpDisciplineConnection);
            
            // Helpers
            const PAGE_SIZE = 2; // compact like your screenshot

            const buildCaseDetails = (caseItem) => {
                // Handle casefile URL safely
                let caseFileLink = 'No case file available';
                if (caseItem.casefile && String(caseItem.casefile).trim() !== '') {
                    caseFileLink = `[View Case](${caseItem.casefile})`;
                }

                // Build detailed case information with proper formatting
                let caseDetails = `**Offender:** ${caseItem.offender}\n**ID:** ${caseItem.offenderId}\n**Status:** ${caseItem.status}\n**Division:** ${caseItem.division}`;
                
                // Parse and format details if available
                if (caseItem.details) {
                    const detailsParts = String(caseItem.details).split(/(?=Unit:|Username of offender:|Punishment:|Reason:|Evidence:)/);
                    detailsParts.forEach(part => {
                        if (!part) return;
                        const trimmedPart = part.trim();
                        if (trimmedPart.startsWith('Unit:')) {
                            caseDetails += `\n**Details:** ${trimmedPart}`;
                        } else if (trimmedPart.startsWith('Username of offender:')) {
                            caseDetails += `\n**Username of offender:** ${trimmedPart.replace('Username of offender:', '').trim()}`;
                        } else if (trimmedPart.startsWith('Punishment:')) {
                            caseDetails += `\n**Punishment:** ${trimmedPart.replace('Punishment:', '').trim()}`;
                        } else if (trimmedPart.startsWith('Reason:')) {
                            caseDetails += `\n**Reason:** ${trimmedPart.replace('Reason:', '').trim()}`;
                        } else if (trimmedPart.startsWith('Evidence:')) {
                            const evidenceText = trimmedPart.replace('Evidence:', '').trim();
                            if (evidenceText) {
                                caseDetails += `\n**Evidence:** ${evidenceText}`;
                            }
                        } else {
                            caseDetails += `\n**Details:** ${trimmedPart}`;
                        }
                    });
                }
                
                if (caseItem.auditorUsername && caseItem.auditorUsername !== 'Unknown') {
                    caseDetails += `\n**Auditor:** ${caseItem.auditorUsername}`;
                }
                caseDetails += `\n**Created:** <t:${Math.floor(new Date(caseItem.createdAt).getTime() / 1000)}:R>`;
                caseDetails += `\n**Case File:** ${caseFileLink}`;
                return caseDetails;
            };

            const buildEmbedForPage = async ({ title, description, cases, page }) => {
                const start = page * PAGE_SIZE;
                const end = start + PAGE_SIZE;
                const slice = cases.slice(start, end);

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor('#4ECDC4')
                    .setTimestamp();

                slice.forEach((caseItem) => {
                    const statusEmoji = {
                        'Active': '🔴',
                        'Archived': '📁',
                        'Pending': '⏳',
                        'Resolved': '✅'
                    };
                    const caseIdText = (caseItem._id !== undefined && caseItem._id !== null) ? String(caseItem._id) : 'Unknown';
                    embed.addFields({
                        name: `${statusEmoji[caseItem.status] || '📝'} Case ${caseIdText}`,
                        value: buildCaseDetails(caseItem),
                        inline: false
                    });
                });

                embed.setFooter({ text: `Page ${page + 1}/${Math.max(1, Math.ceil(cases.length / PAGE_SIZE))}` });
                return embed;
            };

            async function findAliasesByName(name) {
                // Find offenderIds that have this offender name
                const idMatches = await MPDisciplineCase.find({ offender: { $regex: name, $options: 'i' } }).select('offenderId').limit(50);
                const offenderIds = [...new Set(idMatches.map(d => d.offenderId).filter(v => v && v !== 'Unknown'))];
                // Find other names tied to those IDs
                let aliasNames = [];
                if (offenderIds.length) {
                    const nameDocs = await MPDisciplineCase.find({ offenderId: { $in: offenderIds } }).select('offender').limit(200);
                    aliasNames = [...new Set(nameDocs.map(d => d.offender).filter(Boolean))];
                }
                return { offenderIds, aliasNames };
            }
            
            const subcommand = interaction.options.getSubcommand();
            let cases = [];
            let searchTitle = '';
            let searchDescription = '';

            switch (subcommand) {
                case 'by_offender':
                    const username = interaction.options.getString('username');
                    const { offenderIds, aliasNames } = await findAliasesByName(username);

                    const orConditions = [
                        { offender: { $regex: username, $options: 'i' } },
                        { details: { $regex: username, $options: 'i' } }
                    ];
                    if (aliasNames.length) {
                        orConditions.push({ offender: { $in: aliasNames } });
                    }
                    if (offenderIds.length) {
                        orConditions.push({ offenderId: { $in: offenderIds } });
                    }

                    cases = await MPDisciplineCase.find({ $or: orConditions }).sort({ createdAt: -1 }).limit(50);

                    const aliasNote = [username, ...aliasNames.filter(n => n.toLowerCase() !== username.toLowerCase())]
                        .filter(Boolean)
                        .slice(0, 10) // keep concise
                        .join(', ');
                    searchTitle = `Case Search Results for: ${username}`;
                    searchDescription = `Found ${cases.length} case(s). Known usernames: ${aliasNote || username}`;
                    break;

                case 'by_offender_id':
                    const userId = interaction.options.getString('user_id');
                    cases = await MPDisciplineCase.find({ offenderId: userId }).sort({ createdAt: -1 }).limit(50);
                    // Also collect aliases for display
                    const distinctNames = [...new Set(cases.map(c => c.offender).filter(Boolean))];
                    searchTitle = `Case Search Results for User ID: ${userId}`;
                    searchDescription = `Found ${cases.length} case(s). Known usernames: ${distinctNames.join(', ') || 'Unknown'}`;
                    break;

                case 'by_case_id':
                    const caseId = interaction.options.getString('case_id');
                    // Support numeric IDs used in the mp_discipline database
                    const parsedId = Number(caseId);
                    cases = await MPDisciplineCase.find({
                        _id: isNaN(parsedId) ? caseId : parsedId
                    }).limit(1);
                    searchTitle = `Case Search Results for Case ID: ${caseId}`;
                    searchDescription = cases.length > 0 ? `Found case "${caseId}"` : `No case found with ID "${caseId}"`;
                    break;

                case 'by_status':
                    const status = interaction.options.getString('status');
                    cases = await MPDisciplineCase.find({
                        status: status
                    }).sort({ createdAt: -1 }).limit(10);
                    searchTitle = `Case Search Results for Status: ${status}`;
                    searchDescription = `Found ${cases.length} case(s) with status "${status}"`;
                    break;

                case 'recent':
                    const limit = interaction.options.getInteger('limit') || 5;
                    cases = await MPDisciplineCase.find({})
                        .sort({ createdAt: -1 })
                        .limit(limit);
                    searchTitle = `Recent Cases`;
                    searchDescription = `Showing ${cases.length} most recent case(s)`;
                    break;
            }

            if (cases.length === 0) {
                const noResultsEmbed = new EmbedBuilder()
                    .setTitle('No Cases Found')
                    .setDescription('No cases match your search criteria.')
                    .setColor('#FF6B6B')
                    .setTimestamp();
                
                return interaction.editReply({ embeds: [noResultsEmbed] });
            }

            // Paginated response with buttons
            let page = 0;
            const totalPages = Math.max(1, Math.ceil(cases.length / PAGE_SIZE));
            const buildButtons = (disabled = false) => new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('prev').setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page === 0),
                    new ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= totalPages - 1),
                    new ButtonBuilder().setCustomId('stop').setLabel('Stop').setStyle(ButtonStyle.Danger).setDisabled(disabled)
                );

            const firstEmbed = await buildEmbedForPage({ title: searchTitle, description: searchDescription, cases, page });
            const msg = await interaction.editReply({ embeds: [firstEmbed], components: [buildButtons()] });

            // Collector for 3 minutes
            const collector = msg.createMessageComponentCollector({ time: 3 * 60 * 1000, filter: (i) => i.user.id === interaction.user.id });
            collector.on('collect', async (i) => {
                try {
                    if (i.customId === 'prev' && page > 0) page -= 1;
                    if (i.customId === 'next' && page < totalPages - 1) page += 1;
                    if (i.customId === 'stop') {
                        // Immediately acknowledge and disable buttons to avoid interaction failed
                        const embed = await buildEmbedForPage({ title: searchTitle, description: searchDescription, cases, page });
                        await i.update({ embeds: [embed], components: [buildButtons(true)] });
                        collector.stop('stopped');
                        return;
                    }
                    const embed = await buildEmbedForPage({ title: searchTitle, description: searchDescription, cases, page });
                    await i.update({ embeds: [embed], components: [buildButtons()] });
                } catch (err) {
                    console.error('Paginator update failed:', err);
                }
            });

            collector.on('end', async (_collected, reason) => {
                try {
                    if (reason === 'stopped') return; // already acknowledged and disabled
                    const embed = await buildEmbedForPage({ title: searchTitle, description: searchDescription, cases, page });
                    await interaction.editReply({ embeds: [embed], components: [buildButtons(true)] });
                } catch (err) {
                    console.error('Paginator end update failed:', err);
                }
            });

        } catch (error) {
            console.error('Error in case search:', error);
            return interactionEmbed(3, "[ERR-CASE-SEARCH]", 'An error occurred while searching for cases.', interaction, client, [true, 30]);
        }
    }
};
