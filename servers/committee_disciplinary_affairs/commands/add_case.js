/* eslint-disable no-undef */
const {
  SlashCommandBuilder,
  Client,
  CommandInteraction,
  EmbedBuilder,
} = require("discord.js");
const { getMPDisciplineCaseModel } = require("../../../DBModels/mpDiscipline");
const { interactionEmbed } = require("../../../functions");
const { addcase } = require("../../../permissions.json")["cda"];
const { default: fetch } = require("node-fetch");
const inputValidator = require("../../../utils/inputValidator");

module.exports = {
  name: "add_case",
  description: "Add a new MP discipline case to the database",
  data: new SlashCommandBuilder()
    .setName("add_case")
    .setDescription("Add a new MP discipline case")
    .addStringOption((option) =>
      option
        .setName("offender")
        .setDescription("Roblox username of the offender")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("casefile")
        .setDescription("URL to the case file/evidence")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("details")
        .setDescription("Additional details about the case")
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName("division")
        .setDescription("Division involved")
        .setRequired(false)
        .addChoices(
          { name: "MP", value: "MP" },
          { name: "NDD", value: "NDD" },
          { name: "RG", value: "RG" },
          { name: "24th", value: "24th" },
          { name: "3GT", value: "3GT" },
          { name: "STAVKA", value: "STAVKA" },
          { name: "98th", value: "98th" },
          { name: "ISOC", value: "ISOC" },
          { name: "ACS", value: "ACS" },
          { name: "Other", value: "Other" }

        )
    )
    .addStringOption((option) =>
      option
        .setName("status")
        .setDescription("Case status")
        .setRequired(false)
        .addChoices(
          { name: "Active", value: "Active" },
          { name: "Pending", value: "Pending" },
          { name: "Resolved", value: "Resolved" },
          { name: "Archived", value: "Archived" }
        )
    ),
  /**
   * @param {Client} client
   * @param {CommandInteraction} interaction
   */
  run: async (client, interaction) => {
    await interaction.deferReply();

    const hasRole = addcase.some((roleId) =>
      interaction.member.roles.cache.has(roleId)
    );
    if (!hasRole) {
      return interactionEmbed(
        3,
        "[ERR-UPRM]",
        "Not proper permissions",
        interaction,
        client,
        [true, 30]
      );
    }

    try {
      // Get the MP Discipline model using the separate connection
      const MPDisciplineCase = getMPDisciplineCaseModel(
        client.mpDisciplineConnection
      );

      const offenderRaw = interaction.options.getString("offender");
      const casefileRaw = interaction.options.getString("casefile");
      const detailsRaw = interaction.options.getString("details");
      const division = interaction.options.getString("division") || "MP";
      const status = interaction.options.getString("status") || "Active";

      // Validate all user inputs to prevent injection and XSS attacks
      const validation = inputValidator.validateMultiple(
        {
          offender: offenderRaw,
          casefile: casefileRaw,
          details: detailsRaw
        },
        {
          offender: { type: 'robloxUsername' },
          casefile: { type: 'url' },
          details: { type: 'text', maxLength: 4000 }
        }
      );

      if (!validation.valid) {
        const errorFields = Object.entries(validation.errors)
          .map(([field, error]) => `**${field}:** ${error}`)
          .join('\n');
        
        const validationEmbed = new EmbedBuilder()
          .setTitle('⚠️ Input Validation Failed')
          .setDescription('Please correct the following errors:')
          .addFields({
            name: 'Validation Errors',
            value: errorFields,
            inline: false
          })
          .setColor(0xFF9900)
          .setFooter({ text: 'Security: Input validation active' })
          .setTimestamp();
        
        return await interaction.editReply({ embeds: [validationEmbed] });
      }

      // Use sanitized values from this point forward
      const offender = validation.sanitized.offender;
      const casefile = validation.sanitized.casefile;
      const details = validation.sanitized.details || null;

      // Fetch Roblox ID from username using reliable API with fallback
      await interaction.editReply({
        content: "🔍 Fetching Roblox user information...",
      });

      let robloxUserResponse;
      try {
        // Try primary endpoint: users.roblox.com
        robloxUserResponse = await fetch(
          "https://users.roblox.com/v1/usernames/users",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              usernames: [offender],
              excludeBannedUsers: false,
            }),
          }
        ).then((res) => res.json());
      } catch (error) {
        // Fallback to rotunnel if main API fails
        try {
          robloxUserResponse = await fetch(
            "https://users.rotunnel.com/v1/usernames/users",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                usernames: [offender],
                excludeBannedUsers: false,
              }),
            }
          ).then((res) => res.json());
        } catch (fallbackError) {
          return interactionEmbed(
            3,
            "[ERR-ROBLOX]",
            `Could not connect to Roblox API. Please try again later.`,
            interaction,
            client,
            [true, 30]
          );
        }
      }

      // Check if user was found
      if (!robloxUserResponse.data || robloxUserResponse.data.length === 0) {
        return interactionEmbed(
          3,
          "[ERR-ROBLOX]",
          `Could not find Roblox user with username: **${offender}**. Please verify the username is correct.`,
          interaction,
          client,
          [true, 30]
        );
      }

      const offenderId = robloxUserResponse.data[0].id.toString();

      // Generate next case ID (auto-increment)
      await interaction.editReply({
        content: "📝 Generating case ID...",
      });

      const lastCase = await MPDisciplineCase.findOne()
        .sort({ _id: -1 })
        .limit(1)
        .lean();
      
      const nextCaseId = lastCase ? lastCase._id + 1 : 1;

      // Create new case with sanitized data
      const newCase = new MPDisciplineCase({
        _id: nextCaseId,
        offender: offender, // Already validated and sanitized
        offenderId: offenderId,
        casefile: casefile, // Already validated and sanitized
        details: details, // Already validated and sanitized
        division: division, // From predefined choices
        status: status, // From predefined choices
        auditorUsername: interaction.user.username,
        auditorId: interaction.user.id,
        migratedAt: new Date(),
        migratedBy: interaction.user.id,
      });

      await newCase.save();

      const successEmbed = new EmbedBuilder()
        .setTitle("✅ Case Added Successfully")
        .setDescription(
          "New MP discipline case has been added to the database."
        )
        .setColor("#00FF00")
        .addFields(
          {
            name: "Case ID",
            value: `#${nextCaseId}`,
            inline: true,
          },
          {
            name: "Offender (Roblox)",
            value: offender,
            inline: true,
          },
          {
            name: "Roblox ID",
            value: offenderId,
            inline: true,
          },
          {
            name: "Status",
            value: status,
            inline: true,
          },
          {
            name: "Division",
            value: division,
            inline: true,
          },
          {
            name: "Case File",
            value: `[View Case](${casefile})`,
            inline: false,
          }
        )
        .setFooter({
          text: `Added by ${interaction.user.username} | Committee Disciplinary Affairs`,
        })
        .setTimestamp();

      await interaction.editReply({ content: null, embeds: [successEmbed] });
    } catch (error) {
      console.error("Error adding case:", error);
      console.error("Error stack:", error.stack);
      console.error("Error details:", {
        message: error.message,
        name: error.name,
        offender: interaction.options.getString("offender"),
      });
      return interactionEmbed(
        3,
        "[ERR-ADD-CASE]",
        "Please report this to the support server!",
        interaction,
        client,
        [true, 30]
      );
    }
  },
};
