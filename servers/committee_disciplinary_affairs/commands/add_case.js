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

module.exports = {
  name: "add_case",
  description: "Add a new MP discipline case to the database",
  data: new SlashCommandBuilder()
    .setName("add_case")
    .setDescription("Add a new MP discipline case")
    .addStringOption((option) =>
      option
        .setName("offender")
        .setDescription("Username of the offender")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("offender_id")
        .setDescription("Discord user ID of the offender")
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

      const offender = interaction.options.getString("offender");
      const offenderId = interaction.options.getString("offender_id");
      const casefile = interaction.options.getString("casefile");
      const details = interaction.options.getString("details") || null;
      const division = interaction.options.getString("division") || "MP";
      const status = interaction.options.getString("status") || "Active";

      // Create new case
      const newCase = new MPDisciplineCase({
        offender: offender,
        offenderId: offenderId,
        casefile: casefile,
        details: details,
        division: division,
        status: status,
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
            name: "Offender",
            value: offender,
            inline: true,
          },
          {
            name: "Offender ID",
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

      await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      console.error("Error adding case:", error);
      console.error("Error stack:", error.stack);
      console.error("Error details:", {
        message: error.message,
        name: error.name,
        offender: interaction.options.getString("offender"),
        offenderId: interaction.options.getString("offender_id"),
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
