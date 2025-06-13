// eslint-disable no-undef
// eslint-disable-next-line no-unused-vars
const { SlashCommandBuilder, Client, CommandInteraction, CommandInteractionOptionResolver, EmbedBuilder, Colors, MessageFlags } = require("discord.js");
const { getRowifi } = require("../../../functions");
const nbx = require("noblox.js");
const StaffVerification = require("../../../DBModels/StaffVerification"); // Adjust path as needed
const { logevent } = require('../../../permissions.json').mp;

module.exports = {
  name: "staffregister",
  description: "Register staff member in the database with email and MP rank verification.",
  data: new SlashCommandBuilder()
    .setName("staffregister")
    .setDescription("Register staff member in the database with email and MP rank verification")
    .addUserOption(option => {
      return option
        .setName("user")
        .setDescription("Select the user to register")
        .setRequired(true);
    })
    .addStringOption(option => {
      return option
        .setName("email")
        .setDescription("Enter the staff member's email address")
        .setRequired(true);
    })

    .addBooleanOption(option => {
      return option  
        .setName("ephemeral")
        .setDescription("Whether or not the response should be ephemeral")
        .setRequired(false);
    }),

  /**
   * @param {Client} client
   * @param {CommandInteraction} interaction
   * @param {CommandInteractionOptionResolver} options
   */
  
  run: async (client, interaction) => {
    try {

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        
        const hasRole = logevent.some(roleId => interaction.member.roles.cache.has(roleId));
        if (!hasRole) {
            return interactionEmbed(3, "[ERR-UPRM]", 'Not proper permissions', interaction, client, [true, 30]);
        }

        const user = interaction.options.getUser("user");
        const email = interaction.options.getString("email");
        const mpGroupId = 6232598; // Fixed MP Group ID
        const ephemeral = interaction.options.getBoolean("ephemeral") || false;
        
        const discordId = user.id;
        const discordUsername = user.username;

        // Check if user already exists in database
        const existingUser = await StaffVerification.findOne({
            $or: [
                { discord_user_id: discordId },
                { email: email }
            ]
        });

        if (existingUser) {
            const embed = new EmbedBuilder({
                title: "Registration Failed",
                description: "❌ This user or email is already registered in the database.",
                color: Colors.Red,
                footer: {
                    text: `⚠ MP - Secure Transmission at ${new Date().toLocaleTimeString()} ${new Date().toString().match(/GMT([+-]\d{2})(\d{2})/)[0]}`,
                    iconURL: client.user.displayAvatarURL()
                }
            });

            return await interaction.editReply({ embeds: [embed], ephemeral: ephemeral });
        }

        // Get RoWifi information
        const rowifi = await getRowifi(discordId, client);

        if (!rowifi.success) {
            const embed = new EmbedBuilder({
                title: "Registration Failed",
                description: "❌ User is not linked with RoWifi. Please link your Roblox account first.",
                fields: [
                    {
                        name: "Error Details",
                        value: rowifi.error,
                        inline: false
                    }
                ],
                color: Colors.Red,
                footer: {
                    text: `⚠ MP - Secure Transmission at ${new Date().toLocaleTimeString()} ${new Date().toString().match(/GMT([+-]\d{2})(\d{2})/)[0]}`,
                    iconURL: client.user.displayAvatarURL()
                }
            });

            return await interaction.editReply({ embeds: [embed], ephemeral: ephemeral });
        }

        // Get Roblox user information
        const robloxUserId = rowifi.roblox;
        const robloxUserInfo = await nbx.getPlayerInfo(robloxUserId);
        const robloxUsername = robloxUserInfo.username;

        // Get user's rank in the MP group
        let mpRank = "N/A";
        let rankId = 0;

        try {
            rankId = await nbx.getRankInGroup(mpGroupId, robloxUserId);
            if (rankId > 0) {
                const rankName = await nbx.getRankNameInGroup(mpGroupId, robloxUserId);
                mpRank = rankName;
            } else {
                mpRank = "N/A"; // Not in group, set as N/A
            }
        } catch (error) {
            console.error("Error fetching MP rank:", error);
            mpRank = "N/A";
            rankId = 0;
        }

        // Create new staff verification entry
        const newStaffMember = new StaffVerification({
            email: email.toLowerCase().trim(),
            discord_user_id: discordId,
            discord_username: discordUsername,
            roblox_username: robloxUsername,
            military_police_rank: mpRank,
            verification_status: rankId > 0 ? 'verified' : 'pending',
            verified_by: interaction.user.id
        });

        // Save to database
        await newStaffMember.save();

        // Create success embed
        const embed = new EmbedBuilder({
            title: "Staff Registration Successful",
            description: "✅ Staff member has been successfully registered in the database.",
            fields: [
                {
                    name: "Discord Information",
                    value: `**Username:** ${discordUsername}\n**ID:** ${discordId}`,
                    inline: true
                },
                {
                    name: "Roblox Information", 
                    value: `**Username:** ${robloxUsername}\n**ID:** ${robloxUserId}`,
                    inline: true
                },
                {
                    name: "Contact Information",
                    value: `**Email:** ${email}`,
                    inline: false
                },
                {
                    name: "Military Police Rank",
                    value: `**Rank:** ${mpRank}\n**Status:** ${rankId > 0 ? '✅ Verified' : 'N/A'}`,
                    inline: false
                },
                {
                    name: "Database Information",
                    value: `**Member ID:** ${newStaffMember.member_id}\n**Registered by:** <@${interaction.user.id}>`,
                    inline: false
                }
            ],
            color: rankId > 0 ? Colors.Green : Colors.Yellow,
            footer: {
                text: `⚠ MP - Secure Transmission at ${new Date().toLocaleTimeString()} ${new Date().toString().match(/GMT([+-]\d{2})(\d{2})/)[0]}`,
                iconURL: client.user.displayAvatarURL()
            }
        });

        if (robloxUserId) {
            embed.addFields({ 
                name: "Roblox Profile", 
                value: `https://www.roblox.com/users/${robloxUserId}/profile` 
            });
        }

        // Edit the deferred reply
        await interaction.editReply({ embeds: [embed], ephemeral: ephemeral });

    } catch (error) {
        console.error("Staff registration error:", error);
        
        const errorEmbed = new EmbedBuilder({
            title: "Registration Error",
            description: "❌ An error occurred while processing the staff registration.",
            fields: [
                {
                    name: "Error Details",
                    value: error.message || "Unknown error occurred",
                    inline: false
                }
            ],
            color: Colors.Red,
            footer: {
                text: `⚠ MP - Secure Transmission at ${new Date().toLocaleTimeString()} ${new Date().toString().match(/GMT([+-]\d{2})(\d{2})/)[0]}`,
                iconURL: client.user.displayAvatarURL()
            }
        });

        // In case of an error, reply with an error message if the interaction hasn't been replied to yet
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        } else {
            await interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
 }
}