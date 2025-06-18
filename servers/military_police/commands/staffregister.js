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

        // Get Roblox user information with exponential backoff
        const robloxUserId = rowifi.roblox;
        let robloxUsername = "Unknown";

        try {
            // Use exponential backoff for username retrieval
            robloxUsername = await exponentialBackoff(async () => {
                return await nbx.getUsernameFromId(robloxUserId);
            }, 3);
        } catch (usernameError) {
            console.warn("Failed to get username after retries, using fallback:", usernameError.message);
            robloxUsername = `User_${robloxUserId}`; // Use ID as fallback
        }

        // Exponential backoff utility function
        const exponentialBackoff = async (fn, maxRetries = 3) => {
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    return await fn();
                } catch (error) {
                    if (attempt === maxRetries) {
                        throw error;
                    }
                    
                    // Check if it's a rate limit error (429) or network error
                    const isRetryableError = error.message && (
                        error.message.includes('429') || 
                        error.message.includes('Too many requests') ||
                        error.message.includes('ECONNRESET') ||
                        error.message.includes('timeout')
                    );
                    
                    if (!isRetryableError) {
                        throw error; // Don't retry non-retryable errors
                    }
                    
                    // Calculate delay: 2^attempt * 1000ms (1s, 2s, 4s, 8s...)
                    const delay = Math.pow(2, attempt) * 1000;
                    console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        };

        // Get user's rank in the MP group with exponential backoff - but set as N/A if it fails
        let mpRank = "N/A";
        let rankId = 0;

        try {
            // Try to get rank with exponential backoff, but don't let it block registration
            await exponentialBackoff(async () => {
                rankId = await nbx.getRankInGroup(mpGroupId, robloxUserId);
                if (rankId > 0) {
                    const rankName = await nbx.getRankNameInGroup(mpGroupId, robloxUserId);
                    mpRank = rankName;
                }
            }, 2); // Only 2 retries to avoid long delays
        } catch (error) {
            console.warn("Failed to retrieve MP rank after retries, setting as N/A:", error.message);
            mpRank = "N/A";
            rankId = 0;
            // Continue with registration regardless of rank fetch failure
        }

        // Create new staff verification entry - always set verification_status as 'pending' since rank is N/A
        const newStaffMember = new StaffVerification({
            email: email.toLowerCase().trim(),
            discord_user_id: discordId,
            discord_username: discordUsername,
            roblox_username: robloxUsername,
            military_police_rank: mpRank, // Will always be "N/A" with this approach
            verification_status: 'pending', // Always pending since we're not relying on rank verification
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
                    value: `**Rank:** ${mpRank}\n**Status:** Pending Manual Verification`,
                    inline: false
                },
                {
                    name: "Database Information",
                    value: `**Member ID:** ${newStaffMember.member_id}\n**Registered by:** <@${interaction.user.id}>\n**Status:** Pending`,
                    inline: false
                }
            ],
            color: Colors.Yellow, // Always yellow since status is always pending
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

        // Add a note if we encountered rate limiting but still succeeded
        if (robloxUsername.startsWith('User_') || mpRank === "N/A") {
            embed.addFields({
                name: "⚠️ Note",
                value: "Some information may be limited due to API rate limiting. The registration was still successful.",
                inline: false
            });
        }

        // Edit the deferred reply
        await interaction.editReply({ embeds: [embed], ephemeral: ephemeral });

    } catch (error) {
        console.error("Staff registration error:", error);
        
        // More detailed error handling
        let errorDescription = "❌ An error occurred while processing the staff registration.";
        let errorDetails = error.message || "Unknown error occurred";
        
        // Check if it's a rate limiting error
        if (error.message && error.message.includes('429')) {
            errorDescription = "❌ Registration failed due to Roblox API rate limiting.";
            errorDetails = "The bot is making too many requests to Roblox. Please wait a few minutes and try again.";
        }
        
        const errorEmbed = new EmbedBuilder({
            title: "Registration Error",
            description: errorDescription,
            fields: [
                {
                    name: "Error Details",
                    value: errorDetails,
                    inline: false
                },
                {
                    name: "Suggested Actions",
                    value: "• Wait 2-3 minutes before retrying\n• Check if the user is properly linked with RoWifi\n• Verify the user exists on Roblox",
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