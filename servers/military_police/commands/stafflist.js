const { SlashCommandBuilder, EmbedBuilder, Colors, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const StaffVerification = require("../../../DBModels/StaffVerification");
const { logevent } = require('../../../permissions.json').mp;

module.exports = {
    name: "stafflist",
    description: "View all registered staff (Roblox username, Discord username, MP rank, email)",
    data: new SlashCommandBuilder()
        .setName("stafflist")
        .setDescription("View all registered staff in the database"),
    /**
     * @param {import('discord.js').Client} client
     * @param {import('discord.js').CommandInteraction} interaction
     */
    run: async (client, interaction) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId));
        if (!hasRole) {
            return interactionEmbed(3, "[ERR-UPRM]", 'Not proper permissions', interaction, client, [true, 30]);
        }
        try {
            const staffList = await StaffVerification.find({}, "roblox_username discord_username military_police_rank email").lean();

            if (!staffList.length) {
                return await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(Colors.Yellow)
                            .setTitle("Staff List")
                            .setDescription("No staff members found in the database.")
                    ]
                });
            }

            // Paginate if more than 10 entries
            const pageSize = 10;
            const pages = Math.ceil(staffList.length / pageSize);

            // If only one page, just send it without buttons
            if (pages === 1) {
                const embed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(`Staff List`)
                    .setDescription("**Roblox Username | Discord Username | MP Rank | Email**")
                    .setFooter({ text: `Total staff: ${staffList.length}` });

                staffList.forEach(staff => {
                    embed.addFields({
                        name: `${staff.roblox_username || "N/A"} | ${staff.discord_username || "N/A"}`,
                        value: `**MP Rank:** ${staff.military_police_rank || "N/A"}\n**Email:** ${staff.email || "N/A"}`,
                        inline: false
                    });
                });

                return await interaction.editReply({ embeds: [embed] });
            }

            // Create embed for current page
            const createEmbed = (pageIndex) => {
                const slice = staffList.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
                const embed = new EmbedBuilder()
                    .setColor(Colors.Blue)
                    .setTitle(`Staff List (Page ${pageIndex + 1}/${pages})`)
                    .setDescription("**Roblox Username | Discord Username | MP Rank | Email**")
                    .setFooter({ text: `Total staff: ${staffList.length}` });

                slice.forEach(staff => {
                    embed.addFields({
                        name: `${staff.roblox_username || "N/A"} | ${staff.discord_username || "N/A"}`,
                        value: `**MP Rank:** ${staff.military_police_rank || "N/A"}\n**Email:** ${staff.email || "N/A"}`,
                        inline: false
                    });
                });

                return embed;
            };

            // Create buttons
            const createButtons = (currentPage) => {
                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('first')
                            .setLabel('⏮️ First')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(currentPage === 0),
                        new ButtonBuilder()
                            .setCustomId('previous')
                            .setLabel('◀️ Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === 0),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('Next ▶️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(currentPage === pages - 1),
                        new ButtonBuilder()
                            .setCustomId('last')
                            .setLabel('Last ⏭️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(currentPage === pages - 1)
                    );
                return row;
            };

            let currentPage = 0;
            const embed = createEmbed(currentPage);
            const buttons = createButtons(currentPage);

            const message = await interaction.editReply({
                embeds: [embed],
                components: [buttons]
            });

            // Create collector for button interactions
            const collector = message.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 300000 // 5 minutes
            });

            collector.on('collect', async (buttonInteraction) => {
                // Check if the user who clicked is the same as who ran the command
                if (buttonInteraction.user.id !== interaction.user.id) {
                    return await buttonInteraction.reply({
                        content: 'You cannot use these buttons. Run the command yourself to navigate.',
                        ephemeral: true
                    });
                }

                // Update current page based on button clicked
                switch (buttonInteraction.customId) {
                    case 'first':
                        currentPage = 0;
                        break;
                    case 'previous':
                        currentPage = Math.max(0, currentPage - 1);
                        break;
                    case 'next':
                        currentPage = Math.min(pages - 1, currentPage + 1);
                        break;
                    case 'last':
                        currentPage = pages - 1;
                        break;
                }

                // Update embed and buttons
                const newEmbed = createEmbed(currentPage);
                const newButtons = createButtons(currentPage);

                await buttonInteraction.update({
                    embeds: [newEmbed],
                    components: [newButtons]
                });
            });

            collector.on('end', async () => {
                // Disable all buttons when collector expires
                const disabledButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('first')
                            .setLabel('⏮️ First')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('previous')
                            .setLabel('◀️ Previous')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setLabel('Next ▶️')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId('last')
                            .setLabel('Last ⏭️')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true)
                    );

                try {
                    await interaction.editReply({
                        components: [disabledButtons]
                    });
                } catch (error) {
                    // Ignore errors when trying to edit expired interaction
                    console.log('Could not disable buttons - interaction may have expired');
                }
            });

        } catch (error) {
            console.error("Error fetching staff list:", error);
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.Red)
                        .setTitle("Error")
                        .setDescription("Failed to fetch staff list.")
                ]
            });
        }
    }
};