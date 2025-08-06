const {
  SlashCommandBuilder,
  Client,
  CommandInteraction,
  CommandInteractionOptionResolver,
  EmbedBuilder,
  Colors
} = require("discord.js");
const { getRowifi } = require("../../../functions");

module.exports = {
  name: "rowificheck_rg",
  description: "Gives you back the RoWifi details.",
  data: new SlashCommandBuilder()
    .setName("rowificheck_rg")
    .setDescription("Gives you back the RoWifi details.")
    .addUserOption(option =>
      option
        .setName("user")
        .setDescription("Select the user to check RoWifi details for")
        .setRequired(true)
    )
    .addBooleanOption(option =>
      option
        .setName("ephemeral")
        .setDescription("Whether or not the response should be ephemeral")
    ),

  /**
   * @param {Client} client
   * @param {CommandInteraction} interaction
   */
  run: async (client, interaction) => {
    try {
      const user = interaction.options.getUser("user");
      const ephemeral = interaction.options.getBoolean("ephemeral") ?? false;
      await interaction.deferReply({ ephemeral });

      const rowifi = await getRowifi(user.id, client);

      const embed = new EmbedBuilder()
        .setTitle("RoWifi Status")
        .setColor(Colors.DarkNavy)
        .addFields([
          {
            name: "RoWifi Link",
            value: rowifi.success
              ? `✅ Yes, [${rowifi.username}](https://www.roblox.com/users/${rowifi.roblox}/profile)`
              : `❌ No - ${rowifi.error || "Unknown error"}`,
            inline: false
          },
          {
            name: "Discord ID",
            value: `\`${user.id}\``,
            inline: false
          }
        ])
        .setFooter({
          text: `⚠ MTA - Secure Transmission at ${new Date().toLocaleTimeString()} ${new Date().toString().match(/GMT([+-]\d{2})(\d{2})/)[0]}`,
          iconURL: client.user.displayAvatarURL()
        })
        .setTimestamp();

      if (rowifi.success) {
        embed.addFields([
          { name: "Roblox Username", value: `\`${rowifi.username}\`` },
          { name: "Roblox Profile Link", value: `https://www.roblox.com/users/${rowifi.roblox}/profile` }
        ]);
      }

      await interaction.editReply({ content: "RoWifi Status", embeds: [embed], ephemeral });
    } catch (error) {
      console.error("[RowifiCheck Error]:", error);
      if (!interaction.replied) {
        await interaction.followUp({ content: "An error occurred while processing your request.", ephemeral: true });
      }
    }
  }
};
