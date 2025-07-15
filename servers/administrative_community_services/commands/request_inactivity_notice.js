// eslint-disable-next-line no-unused-vars
const { EmbedBuilder, SlashCommandBuilder, CommandInteraction, Client, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const moment = require('moment');
const { interactionEmbed } = require('../../../functions');

// Configuration object for easier maintenance
const CONFIG = {
    ROLES: {
        NOTICES: '1274499209239728209',  // Notices role to ping
        ALLOWED_TO_RESPOND: [
            '1274499209239728209',  // First role allowed to accept/deny
            '1274864125738090657'   // Second role allowed to accept/deny
        ]
    },
    CHANNELS: {
        TARGET: '1274488072494645339'  // Channel to send notice
    }
};

// Store request data for modal handling
const requestData = new Map();

module.exports = {
    name: "request_inactivity_notice",
    description: "Submit an inactivity notice.",
    data: new SlashCommandBuilder()
        .setName('request_inactivity_notice')
        .setDescription('Submit an inactivity notice.')
        .addStringOption(option =>
            option.setName('start_date')
                .setDescription('Enter the start date in DD/MM/YYYY format')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('end_date')
                .setDescription('Enter the end date in DD/MM/YYYY format')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for inactivity')
                .setRequired(true)),

    /**
     * @param {Client} client
     * @param {CommandInteraction} interaction
     */
    run: async (client, interaction) => {
        // Defer reply to give time for processing
        await interaction.deferReply({ ephemeral: true });
        
        // Check day of week (0 = Sunday, 6 = Saturday)
        const currentDay = moment().day();
        if (currentDay === 0) {
            return interaction.editReply({
                content: 'This command can only be used from Monday to Saturday.',
                ephemeral: true
            });
        }

        // Extract inputs
        const startDate = interaction.options.getString('start_date');
        const endDate = interaction.options.getString('end_date');
        const reason = interaction.options.getString('reason');
        const username = interaction.user.username;

        // Date validation regex (enforcing DD/MM/2025 format)
        const dateRegex = /^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])\/2025$/;

        // Validate date format
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return interaction.editReply({ 
                content: 'Invalid date format. Please use DD/MM/YYYY format with a valid day (1-31), month (1-12), and year (2025).', 
                ephemeral: true 
            });
        }

        // Convert dates to moment objects
        const startDateMoment = moment(startDate, 'DD/MM/YYYY', true);
        const endDateMoment = moment(endDate, 'DD/MM/YYYY', true);
        const currentDate = moment();

        // Additional date validations
        if (startDateMoment.isBefore(currentDate, 'day')) {
            return interaction.editReply({ 
                content: 'The start date cannot be earlier than today.', 
                ephemeral: true 
            });
        }

        if (endDateMoment.isBefore(startDateMoment, 'day')) {
            return interaction.editReply({ 
                content: 'The end date cannot be earlier than the start date.', 
                ephemeral: true 
            });
        }

        // Create embed for the notice
        const embed = new EmbedBuilder()
            .setColor('Orange')
            .setTitle('Inactivity Notice')
            .setDescription(
                `**Username:** ${username}\n` +
                `**Start Date:** ${startDate}\n` +
                `**End Date:** ${endDate}\n` +
                `**Reason:** ${reason}`
            )
            .setFooter({ 
                text: `Requested by ${username}`, 
                iconURL: interaction.user.displayAvatarURL() 
            })
            .setTimestamp();

        // Create action buttons
        const acceptButton = new ButtonBuilder()
            .setCustomId('accept')
            .setLabel('Accept')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success);

        const denyButton = new ButtonBuilder()
            .setCustomId('deny')
            .setLabel('Deny')
            .setEmoji('❎')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(acceptButton, denyButton);

        try {
            // Fetch target channel
            const targetChannel = await interaction.client.channels.fetch(CONFIG.CHANNELS.TARGET);

            // Store request data for modal handling
            const requestId = `${interaction.user.id}_${Date.now()}`;
            requestData.set(requestId, {
                requesterId: interaction.user.id,
                requesterTag: interaction.user.tag,
                startDate,
                endDate,
                reason,
                username,
                status: 'pending', // Track the status
                handledBy: null    // Track who handled it
            });

            // Send notice to channel with Notices role ping
            const message = await targetChannel.send({ 
                content: `<@&${CONFIG.ROLES.NOTICES}>`, 
                embeds: [embed], 
                components: [row] 
            });
            
            // Create interaction collector
            const filter = i => ['accept', 'deny'].includes(i.customId);
            const collector = message.createMessageComponentCollector({ 
                filter, 
                time: 7 * 24 * 60 * 60 * 1000 // 1 week
            });

            // Handle button interactions
            collector.on('collect', async i => {
                // Get current request data
                const currentData = requestData.get(requestId);
                
                // Check if request has already been handled
                if (!currentData || currentData.status !== 'pending') {
                    return i.reply({ 
                        content: 'This request has already been processed.', 
                        ephemeral: true 
                    });
                }

                // Check if user has permission to respond
                const hasPermission = i.member.roles.cache.some(role => 
                    CONFIG.ROLES.ALLOWED_TO_RESPOND.includes(role.id)
                );

                if (!hasPermission) {
                    return i.reply({ 
                        content: 'You do not have permission to interact with this.', 
                        ephemeral: true 
                    });
                }

                // Handle accept action
                if (i.customId === 'accept') {
                    // Update status immediately to prevent race conditions
                    currentData.status = 'accepted';
                    currentData.handledBy = i.user.id;
                    requestData.set(requestId, currentData);
                    
                    // Stop the collector to prevent further interactions
                    collector.stop('accepted');
                    
                    await i.update({ 
                        content: `Inactivity notice accepted by <@${i.user.id}>.`, 
                        components: [] 
                    });
                    
                    // Try to send DM to original user
                    try {
                        await interaction.user.send({ 
                            content: `Your inactivity notice has been accepted by ${i.user.tag}.`
                        });
                    } catch (error) {
                        // Fallback if DM fails
                        try {
                            await targetChannel.send({
                                content: `Note: Could not send DM to ${interaction.user.tag} about their accepted notice.`
                            });
                        } catch (fallbackError) {
                            console.error('Failed to send fallback message:', fallbackError);
                        }
                    }
                    
                    // Clean up stored data after a delay
                    setTimeout(() => {
                        requestData.delete(requestId);
                    }, 5000); // 5 second delay to allow modal handling to complete if needed
                } 
                // Handle deny action
                else if (i.customId === 'deny') {
                    // Update status to 'denying' to indicate modal is being shown
                    currentData.status = 'denying';
                    currentData.handledBy = i.user.id;
                    requestData.set(requestId, currentData);
                    
                    // Show modal to collect reason
                    const modal = new ModalBuilder()
                        .setCustomId(`deny_reason_modal_${requestId}`)
                        .setTitle('Deny Inactivity Notice');

                    const reasonInput = new TextInputBuilder()
                        .setCustomId('deny_reason')
                        .setLabel('Reason for denial')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                    await i.showModal(modal);
                }
            });

            // Handle collector timeout
            collector.on('end', async (collected, reason) => {
                if (reason === 'accepted') {
                    // Request was accepted, don't modify the message
                    return;
                }
                
                if (collected.size === 0) {
                    try {
                        await message.edit({ components: [] }); // Remove buttons after 1 week
                    } catch (error) {
                        console.error('Failed to remove components on timeout:', error);
                    }
                }
                
                // Clean up stored data
                const currentData = requestData.get(requestId);
                if (currentData && currentData.status === 'pending') {
                    requestData.delete(requestId);
                }
            });

            // Confirm submission to user
            await interaction.editReply({ 
                content: 'Your inactivity notice has been submitted.', 
                ephemeral: true 
            });
            
        } catch (error) {
            // Log and handle any unexpected errors
            console.error('Error in request_inactivity_notice command:', error);
            await interaction.editReply({ 
                content: 'An error occurred while processing your request. Please try again or contact an administrator.', 
                ephemeral: true 
            });
        }
    },

    // Modal handler for deny reason
    async handleDenyModal(client, interaction) {
        const requestId = interaction.customId.replace('deny_reason_modal_', '');
        const storedData = requestData.get(requestId);
        
        if (!storedData) {
            return interaction.reply({
                content: 'This request has expired or is no longer valid.',
                ephemeral: true
            });
        }

        // Check if the request is in the correct state
        if (storedData.status !== 'denying') {
            return interaction.reply({
                content: 'This request has already been processed.',
                ephemeral: true
            });
        }

        // Verify that the person submitting the modal is the same person who clicked deny
        if (storedData.handledBy !== interaction.user.id) {
            return interaction.reply({
                content: 'You are not authorized to complete this action.',
                ephemeral: true
            });
        }

        const denyReason = interaction.fields.getTextInputValue('deny_reason');
        
        // Update status to denied
        storedData.status = 'denied';
        requestData.set(requestId, storedData);
        
        // Update the message to show denial
        await interaction.update({
            content: `Inactivity notice denied by <@${interaction.user.id}>.`,
            components: []
        });

        // Try to send DM to original user with reason
        try {
            const requester = await client.users.fetch(storedData.requesterId);
            await requester.send({
                content: `Your inactivity notice has been denied by ${interaction.user.tag}.\n\n**Reason:** ${denyReason}`
            });
        } catch (error) {
            // Fallback if DM fails
            const targetChannel = await client.channels.fetch(CONFIG.CHANNELS.TARGET);
            try {
                await targetChannel.send({
                    content: `Note: Could not send DM to ${storedData.requesterTag} about their denied notice.`
                });
            } catch (fallbackError) {
                console.error('Failed to send fallback message:', fallbackError);
            }
        }

        // Clean up stored data
        requestData.delete(requestId);
    }
};