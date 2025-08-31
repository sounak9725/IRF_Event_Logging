/* eslint-disable no-unused-vars */
const {
  Client,
  EmbedBuilder,
  Interaction,
  ActionRow,
  ButtonComponent,
  SelectMenuComponent,
  SelectMenuInteraction,
  SelectMenuOptionBuilder,
  ComponentType,
  ActionRowBuilder,
  ButtonStyle,
  ButtonBuilder,
  User,
} = require("discord.js");
const { default: fetch } = require("node-fetch");
const nbx = require("noblox.js"); // Make sure noblox.js is imported
const config = require("./config.json");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const errors = {
  "[ERR-NETWORK]": "There was a problem connecting to Roblox's servers.",
  "[SQL-ERR]": "An error has occurred while communicating with the database",
  "[ERR-CLD]": "You are on cooldown!",
  "[ERR-UPRM]":
    "You do not have the proper permissions to execute this command",
  "[ERR-BPRM]":
    "This bot does not have proper permissions to execute this command",
  "[ERR-ARGS]":
    "You have not supplied the correct parameters. Please check again",
  "[ERR-UNK]": "An unknwon error occurred. Please report this to a developer",
  "[ERR-MISS]": "The requested information wasn't found",
  "[WARN-NODM]":
    "This command isn't available in Direct Messages. Please run this in a server",
  "[WARN-CMD]":
    "The requested slash command was not found. Please refresh your Discord client and try again",
  "[INFO-DEV]":
    "This command is in development. This should not be expected to work",
};

/**
 * @typedef RobloxGroupUserData
 * @prop {RobloxGroupGroupData} group
 * @prop {RobloxGroupRoleData} role
 */
/**
 * @typedef {Object} RobloxGroupGroupData
 * @prop {string} id Group ID
 * @prop {string} name Name of the group
 * @prop {number} memberCount Member count of the group
 */
/**
 * @typedef {Object} RobloxGroupRoleData
 * @prop {number} id Numeric identifier of the role
 * @prop {string} name Name of the role
 * @prop {string} rank Rank of the role (0-255)
 */

/**
 * @description Sends a message to the console
 * @param {String} message [REQUIRED] The message to send to the console
 * @param {String} source [REQUIRED] Source of the message
 * @param {Client} client [REQUIRED] A logged-in Client to send the message
 * @returns {null} null
 * @example toConsole(`Hello, World!`, `functions.js 12:15`, client);
 * @example toConsole(`Published a ban`, `ban.js 14:35`, client);
 */
const toConsole = async (message, source, client) => {
  if (!message || !source || !client)
    return console.error(
      `One or more of the required parameters are missing.\n\n> message: ${message}\n> source: ${source}\n> client: ${client}`
    );
  const channel = await client.channels.cache.get(config.discord.logChannel);
  if (!channel)
    return console.warn(
      "[WARN] toConsole called but bot cannot find config.discord.logChannel",
      message,
      source
    );
  console.log(message);
  source = new RegExp(/(at.+\(.+\)|at .+[\\/].+\.js:.+)/).exec(source)[0];
  // eslint-disable-next-line no-useless-escape
  source = source
    .replace("at ", "")
    .replace(/\(?.+[\\/]/, "")
    .replace(")", "")
    .replace(":", ":");
  console.debug(source);

  channel.send(
    `Incoming message from ${source} at <t:${Math.floor(Date.now() / 1000)}:F>`
  );
  channel.send({
    embeds: [
      new EmbedBuilder({
        title: "Message to Console",
        color: 0xff0000,
        description: message || "",
        footer: {
          text: `Source: ${source} @ ${new Date().toLocaleTimeString()} ${
            new Date().toString().match(/GMT([+-]\d{2})(\d{2})/)[0]
          }`,
        },
        timestamp: new Date(),
      }),
    ],
  });

  return null;
};
/**
 * Fetches Roblox user details by their userId.
 * @param {number} userId - The userId of the Roblox user.
 * @returns {Promise<{
 *   success: boolean,
 *   user?: object,
 *   error?: string
 * }>} An object indicating the success or failure of the operation, along with relevant data or an error message.
 */
const fetchRobloxUserById = async function (userId) {
  // Validate the userId
  if (isNaN(userId)) {
    return { success: false, error: "User ID must be a number" };
  }

  try {
    const response = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    const data = await response.json();

    // Check for API errors
    if (data.errors) {
      return {
        success: false,
        error:
          data.errors[0].userFacingMessage ||
          "An error occurred while fetching the user",
      };
    }

    // Ensure user data is present
    if (!data.id) {
      return { success: false, error: "User data not found in the response" };
    }

    return { success: true, user: data };
  } catch (error) {
    return { success: false, error: "Failed to fetch user: " + error.message };
  }
};
/**
 * Log a message to a specific Discord channel
 * @param {Client} client - The Discord client
 * @param {string} channelId - The ID of the channel to log to
 * @param {Object} options - Logging options
 * @param {string} options.title - Embed title
 * @param {string} options.description - Embed description
 * @param {number} [options.color] - Embed color
 */
const logToChannel = async function (client, channelId, options) {
  try {
    const channel = client.channels.cache.get(channelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle(options.title || "Log Entry")
      .setDescription(options.description || "")
      .setColor(options.color || 0x00ffff)
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Error in logToChannel:", error);
  }
};
/**
 * @description Replies with a EmbedBuilder to the Interaction
 * @param {Number} type 1- Sucessful, 2- Warning, 3- Error, 4- Information
 * @param {String} content The information to state
 * @param {String} expected The expected argument (If applicable)
 * @param {Interaction} interaction The Interaction object for responding
 * @param {Client} client Client object for logging
 * @param {Array<Boolean, Number>} remove Whether to delete the message and the specified timeout in seconds
 * @example interactionEmbed(1, `Removed ${removed} roles`, ``, interaction, client, [false, 0])
 * @example interactionEmbed(3, `[ERR-UPRM]`, `Missing: \`Manage Messages\``, interaction, client, [true, 15])
 * @returns {null}
 */
const interactionEmbed = async function (
  type,
  content,
  expected,
  interaction,
  client,
  remove
) {
  if (
    !type ||
    typeof content != "string" ||
    expected === undefined ||
    !interaction ||
    !client ||
    !remove ||
    remove.length != 2
  )
    throw new SyntaxError(
      `One or more of the required parameters are missing in [interactionEmbed]\n\n> ${type}\n> ${content}\n> ${expected}\n> ${interaction}\n> ${client}`
    );
  if (!interaction.deferred) await interaction.deferReply();
  const embed = new EmbedBuilder();

  switch (type) {
    case 1:
      embed
        .setTitle("Success")
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.avatarURL({ dynamic: true, size: 4096 }),
        })
        .setColor(0x5865f2)
        .setDescription(
          !errors[content] ? expected : `${errors[content]}\n> ${expected}`
        )
        .setTimestamp();

      break;
    case 2:
      embed
        .setTitle("Warning")
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.avatarURL({ dynamic: true, size: 4096 }),
        })
        .setColor(0xfee75c)
        .setDescription(
          !errors[content] ? expected : `${errors[content]}\n> ${expected}`
        )
        .setTimestamp();

      break;
    case 3:
      embed
        .setTitle("Error")
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.avatarURL({ dynamic: true, size: 4096 }),
        })
        .setColor(0xff0000)
        .setDescription(
          !errors[content]
            ? `I don't understand the error "${content}" but was expecting ${expected}. Please report this to the support server!`
            : `${errors[content]}\n> ${expected}`
        )
        .setTimestamp();

      break;
    case 4:
      embed
        .setTitle("Information")
        .setAuthor({
          name: interaction.user.username,
          iconURL: interaction.user.avatarURL({ dynamic: true, size: 4096 }),
        })
        .setColor(0x5865f2)
        .setDescription(
          !errors[content] ? expected : `${errors[content]}\n> ${expected}`
        )
        .setTimestamp();

      break;
  }
  await interaction.editReply({ content: "​", embeds: [embed] });
  if (remove[0])
    setTimeout(() => {
      interaction.deleteReply();
    }, remove[1] * 1000);
  return null;
};
/**
 * Sends buttons to a user and awaits the response
 * @param {Interaction} interaction Interaction object
 * @param {Number} time Seconds for which the buttons are valid
 * @param {Array<ButtonComponent>} buttons The buttons to place on the message
 * @param {String|null} content The content to display, can be blank
 * @param {Boolean} remove Delete the message after the time expires
 * @example awaitButtons(interaction, 15, [button1, button2], `Select a button`, true);
 * @returns {ButtonComponent|null} The button the user clicked or null if no button was clicked
 */
const awaitButtons = async function (
  interaction,
  time,
  buttons,
  content,
  remove
) {
  if (!interaction || !time || !buttons || remove === null)
    return new SyntaxError(
      `One of the following values is not fulfilled:\n> interaction: ${interaction}\n> time: ${time}\n> buttons: ${buttons}\n> remove: ${remove}`
    );
  content = content ?? "Please select an option";

  // Create a filter
  const filter = (i) => {
    return i.user.id === interaction.user.id;
  };
  // Convert the time to milliseconds
  time *= 1000;
  // Create a ActionRow and add the buttons
  const row = new ActionRow();
  row.addComponents(buttons);
  // Send a follow-up message with the buttons and await a response
  const message = await interaction.followUp({
    content: content,
    components: [row],
  });
  const res = await message
    .awaitMessageComponent({
      filter,
      componentType: ComponentType.Button,
      time: time,
      errors: ["time"],
    })
    .catch(() => {
      return null;
    });
  // Disable the buttons on row
  for (const button of row.components) {
    button.setDisabled(true);
  }
  // Step 5: Cleanup
  setTimeout(() => {
    if (message != undefined && remove && res != null) message.delete();
  }, 1500);
  await message.edit({ content: content, components: [] });
  return res;
};
/**
 * Get user's rank name in a Roblox group using noblox.js.
 * Returns "N/A - Failed, enter manual" if not found or on error.
 * @param {string|number} userId - Roblox user ID
 * @param {number} groupId - Roblox group ID
 * @returns {Promise<string>}
 */
const getNobloxRank = async function (userId, groupId) {
  try {
    const rankId = await nbx.getRankInGroup(groupId, userId);
    if (rankId > 0) {
      const rankName = await nbx.getRankNameInGroup(groupId, userId);
      return rankName || "N/A - Failed, enter manual";
    } else {
      return "N/A - Failed, enter manual";
    }
  } catch (error) {
    return "N/A - Failed, enter manual";
  }
};
/**
 * Send a SelectMenuComponent to a user and awaits the response
 * @param {Interaction} interaction Interaction object
 * @param {Number} time Seconds for which the menu is valid
 * @param {Number[]} values [min, max] The amount of values that can be selected
 * @param {SelectMenuOptionBuilder|SelectMenuOptionBuilder[]} options The options for the menu
 * @param {String|null} content The content to display, can be blank
 * @param {Boolean} remove Delete the message after the time expires
 * @example awaitMenu(interaction, 15, [menu], `Select an option`, true);
 * @returns {SelectMenuInteraction|null} The menu the user interacted with or null if nothing was selected
 */
const awaitMenu = async function (
  interaction,
  time,
  values,
  options,
  content,
  remove
) {
  // Step 0: Checks
  if (!interaction || !time || !values || !options || remove === null)
    return new SyntaxError(
      `One of the following values is not fulfilled:\n> interaction: ${interaction}\n> time: ${time}\n> values: ${values}\n> options: ${options}\n> remove: ${remove}`
    );
  content = content ?? "Please select an option";

  // Step 1: Setup
  const filter = (i) => {
    return i.user.id === interaction.user.id;
  };
  time *= 1000;

  // Step 2: Creation
  const row = new ActionRow();
  const menu = new SelectMenuComponent({
    minValues: values[0],
    maxValues: values[1],
    customId: "await-menu",
  });
  menu.addOptions(options);
  row.addComponents(menu);

  // Step 3: Execution
  const message = await interaction.followUp({
    content: content,
    components: [row],
  });
  const res = await message
    .awaitMessageComponent({
      filter,
      componentType: ComponentType.SelectMenu,
      time: time,
      errors: ["time"],
    })
    .catch(() => {
      return null;
    });

  // Step 4: Processing
  row.components[0].setDisabled(true);
  // eslint-disable-next-line no-useless-escape
  await message.edit({
    content: res === null ? ":lock: Cancelled" : content,
    components: [row],
  });

  // Step 5: Cleanup
  setTimeout(() => {
    if (message != undefined && remove && res != null) message.delete();
  }, 1500);
  await message.edit({ content: content, components: [] });
  return res;
};
/**
 * @async
 * @param {string} username Roblox username
 * @param {number} groupId Group ID to fetch
 * @returns {{success: boolean, error: string}|RobloxGroupUserData}
 */
const getGroup = async (username, groupId) => {
  if (!groupId) return { success: false, error: "No group ID provided" };
  if (isNaN(username)) {
    const user = await fetch(
      `https://api.roblox.com/users/get-by-username?username=${username}`
    ).then((res) => res.json());

    if (user.success)
      return {
        success: false,
        error: `Interpreted \`${username}\` as Username but no user was found`,
      };
    username = user.Id;
  } else {
    const user = await fetch(`https://api.roblox.com/users/${username}`).then(
      (res) => res.json()
    );
    if (user.success)
      return {
        success: false,
        error: `Interpreted \`${username}\` as ID but no user was found`,
      };
  }
  const group = await fetch(
    `https://groups.roblox.com/v2/users/${username}/groups/roles`
  ).then((res) => res.json());
  if (group.errorMessage)
    return { success: false, error: `No group found with ID \`${groupId}\`` };
  const role = group.data.find((g) => g.group.id === groupId);
  if (!role)
    return { success: false, error: "User is not in the group specified" };
  return { success: true, data: role };
};

/**
 * @async
 * @param {number|string} user Discord user ID
 * @param {Client} client Discord client
 * @returns {{success: false, error?: string}|{success: true, roblox: string, username: string}}
 */
const getRowifi = async (user, client) => {
  if (!user) return { success: false, error: "No user ID provided" };
  if (!config?.discord?.mainServer || !config?.bot?.rowifiApiKey) {
    return {
      success: false,
      error: "Missing configuration (mainServer or API key)",
    };
  }

  try {
    // Debug logging (remove in production)
    console.log(
      `Making request to: https://api.rowifi.xyz/v3/guilds/${config.discord.mainServer}/members/${user}`
    );
    console.log(`Token exists: ${!!config.bot.rowifiApiKey}`);
    console.log(`Token length: ${config.bot.rowifiApiKey?.length || 0}`);

    const rowifiRes = await fetch(
      `https://api.rowifi.xyz/v3/guilds/${config.discord.mainServer}/members/${user}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bot ${config.bot.rowifiApiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "DiscordBot/1.0",
        },
      }
    );

    // Enhanced error handling for 401
    if (rowifiRes.status === 401) {
      console.error("401 Unauthorized - Check your RoWifi API token");
      return {
        success: false,
        error: "Unauthorized: Invalid API token or insufficient permissions",
      };
    }

    if (rowifiRes.status === 404) {
      return { success: false, error: "User not found in RoWifi database" };
    }

    if (rowifiRes.status === 403) {
      return {
        success: false,
        error: "Forbidden: Bot lacks permissions for this guild",
      };
    }

    if (rowifiRes.status === 429) {
      return { success: false, error: "Rate limited: Too many requests" };
    }

    if (!rowifiRes.ok) {
      const errorText = await rowifiRes.text().catch(() => "Unknown error");
      console.error(
        `RoWifi API Error: ${rowifiRes.status} ${rowifiRes.statusText}`,
        errorText
      );
      return {
        success: false,
        error: `RoWifi API error: ${rowifiRes.status} ${rowifiRes.statusText}`,
      };
    }

    const rowifiData = await rowifiRes.json();
    const robloxId = rowifiData.roblox_id;

    if (!robloxId) {
      return { success: false, error: "No linked Roblox ID found" };
    }

    // Fetch Roblox user data
    const robloxRes = await fetch(
      `https://users.roblox.com/v1/users/${robloxId}`
    );

    if (!robloxRes.ok) {
      return { success: false, error: "Failed to fetch Roblox user data" };
    }

    const robloxData = await robloxRes.json();

    if (robloxData.errors && robloxData.errors.length > 0) {
      return { success: false, error: "Roblox ID is invalid or deleted" };
    }

    return {
      success: true,
      roblox: robloxData.id.toString(),
      username: robloxData.name || robloxData.displayName,
    };
  } catch (error) {
    console.error("Error in getRowifi function:", error);
    return { success: false, error: "Network error or API unavailable" };
  }
};

/**
 * @param {String} time
 * @returns {Number|"NaN"}
 */
const parseTime = function (time) {
  let duration = 0;
  if (!time.match(/[1-9]{1,3}[dhms]/g)) return "NaN";

  for (const period of time.match(/[1-9]{1,3}[dhms]/g)) {
    const [amount, unit] = period.match(/^(\d+)([dhms])$/).slice(1);
    duration +=
      unit === "d"
        ? amount * 24 * 60 * 60
        : unit === "h"
        ? amount * 60 * 60
        : unit === "m"
        ? amount * 60
        : amount;
  }

  return duration;
};

/**
 * @param {interaction} interaction
 * @param {embeds} embeds
 */
const paginationEmbed = async function (interaction, embeds) {
  let allbuttons = new ActionRowBuilder().addComponents([
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setCustomId("1")
      .setLabel("◀"),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setCustomId("2")
      .setLabel("❌"),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Secondary)
      .setCustomId("3")
      .setLabel("▶"),
  ]);
  if (embeds.length === 1) {
    if (interaction.deferred) {
      return interaction.followUp({
        embeds: [embeds[0]],
      });
    } else {
      return interaction.reply({
        embeds: [embeds[0]],
        fetchReply: true,
      });
    }
  }

  embeds = embeds.map((embed, index) => {
    return embed.setFooter({
      text: `Page ${index + 1}/${embeds.length}`,
      iconURL: interaction.guild.iconURL({ dynamic: true }),
    });
  });

  let sendMsg;
  if (interaction.deferred) {
    sendMsg = await interaction.followUp({
      embeds: [embeds[0]],
      components: [allbuttons],
    });
  } else {
    sendMsg = await interaction.reply({
      embeds: [embeds[0]],
      components: [allbuttons],
    });
  }

  let filter = (m) => m.member.id === interaction.member.id;

  const collector = await sendMsg.createMessageComponentCollector({
    filter: filter,
    time: 30000,
  });
  let currentPage = 0;
  collector.on("collect", async (b) => {
    if (b.isButton()) {
      await b.deferUpdate().catch((e) => null);
      // page first
      switch (b.customId) {
        case "1":
          {
            if (currentPage != 0) {
              currentPage -= 1;
              await sendMsg
                .edit({
                  embeds: [embeds[currentPage]],
                  components: [allbuttons],
                })
                .catch((e) => null);
            } else {
              currentPage = embeds.length - 1;
              await sendMsg
                .edit({
                  embeds: [embeds[currentPage]],
                  components: [allbuttons],
                })
                .catch((e) => null);
            }
          }
          break;
        case "2":
          {
            allbuttons.components.forEach((btn) => btn.setDisabled(true));
            await sendMsg
              .edit({
                embeds: [embeds[currentPage]],
                components: [allbuttons],
              })
              .catch((e) => null);
          }
          break;
        case "3":
          {
            if (currentPage < embeds.length - 1) {
              currentPage++;
              await sendMsg
                .edit({
                  embeds: [embeds[currentPage]],
                  components: [allbuttons],
                })
                .catch((e) => null);
            } else {
              currentPage = 0;
              await sendMsg
                .edit({
                  embeds: [embeds[currentPage]],
                  components: [allbuttons],
                })
                .catch((e) => null);
            }
          }
          break;
        default:
          break;
      }
    }
  });

  collector.on("end", async () => {
    allbuttons.components.forEach((btn) => btn.setDisabled(true));
    await sendMsg
      .edit({
        embeds: [embeds[currentPage]],
        components: [allbuttons],
      })
      .catch((e) => null);
  });
};

/**
 * @description Returns the full payload from a Roblox endpoint that returns an object like the following {data:{whatever: "whatever"}}
 * @param {String} url URL to fetch from
 * @param {Object} options Options to pass to node-fetch
 * @returns {{success:false,error:string}|{success:true,payload:Object}}
 */
const paginationResponses = async function (url, options) {
  const resp = await fetch(url, options).then((res) => res.json());
  if (resp.errors) return { success: false, error: resp.errors[0].message };

  const rawPayloads = [resp];
  let cursor = resp.nextPageCursor;
  while (cursor) {
    const newResp = await fetch(`${url}&cursor=${cursor}`, options).then(
      (res) => res.json()
    );
    rawPayloads.push(newResp);
    cursor = newResp.nextPageCursor;
  }

  // Merge all the payloads into one
  const payload = rawPayloads.reduce((acc, cur) => {
    acc.data = acc.data.concat(cur.data);
    return acc;
  });

  return { success: true, payload };
};
/**
 * Retrieves group information for a user by their userId.
 * @param {number} userId - The userId of the user.
 * @param {number} groupId - The groupId of the group.
 * @returns {{
 *   success: boolean,
 *   data?: { group: { id: number, name: string, memberCount: number, hasVerifiedBadge: boolean }, role: { id: number, name: string, rank: number } },
 *   error?: string
 * }} An object indicating the success or failure of the operation, along with relevant data or error message.
 */
const getGroupByUserId = async function (userId, groupId) {
  if (!groupId) return { success: false, error: "No group ID provided" };

  // Check if userId is a number
  if (isNaN(userId)) {
    return { success: false, error: "User ID must be a number" };
  }

  const group = await fetch(
    `https://groups.roblox.com/v2/users/${userId}/groups/roles`
  ).then((res) => res.json());

  if (group.errorMessage)
    return { success: false, error: `No group found with ID \`${groupId}\`` };

  const role = group.data.find((g) => g.group.id === groupId);

  if (!role)
    return { success: false, error: "User is not in the group specified" };

  return { success: true, data: role };
};
/**
 * Extracts Discord user IDs from a given text.
 * @param {string} text - The text to extract user IDs from.
 * @returns {string[]} An array containing the extracted user IDs.
 */
const extractIDs = function (text) {
  const pattern = /<@(\d+)>/g;
  const ids = [];
  let match;

  while ((match = pattern.exec(text))) {
    ids.push(match[1]);
  }

  return ids;
};
/**
 * Fetches user information from Roblox API based on provided usernames.
 * @param {string[]} usernames Array of usernames to fetch user information for.
 * @returns {Promise<{
 *     users: {
 *         id: string,
 *         username: string,
 *         displayName: string
 *     }[],
 *     error: string|null,
 *     success: boolean
 * }>} Object containing user information, error message (if any), and success status.
 */
const fetchUserInformationFromUsernames = async (usernames) => {
  try {
    const response = await fetch(
      "https://users.roblox.com/v1/usernames/users",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          usernames: usernames,
          excludeBannedUsers: false,
        }),
      }
    );

    const data = await response.json();

    if (data.errors && data.errors.length > 0) {
      const errorMessages = data.errors.map((error) => {
        const code = error.code || "Unknown";
        const message = error.message || "Unknown error occurred.";
        const userFacingMessage = error.userFacingMessage || "Unknown";
        return `Code: ${code}. Message: ${message}. UserFacingMessage: ${userFacingMessage}`;
      });

      return {
        users: [],
        error: `Errors occurred: ${errorMessages.join("; ")}`,
        success: false,
      };
    }

    return {
      users: data.data.map((user) => ({
        id: user.id,
        username: user.name,
        displayName: user.displayName,
      })),
      error: null,
      success: true,
    };
  } catch (error) {
    console.error("Error fetching user information:", error);
    return {
      users: [],
      error: `Failed to fetch user information. ${error}`,
      success: false,
    };
  }
};

/**
 * Returns an array of roblox info from inputted Roblox usernames and Discord mentions. Needs Rowifi
 * @param input: string
 * @param interaction: CommandInteraction
 * @param client: Client
 * @returns {Promise<{
 *      users:
 *      {
 *        id: string,
 *        username: string,
 *        discord: User | null
 *      }[]|null,
 *      error: string|null,
 *      success: boolean
 * }>}
 */
const getRobloxInfoFromDiscordMentionsOrRobloxUsernames = async function (
  input,
  interaction,
  client
) {
  /**
   * @type {{
   *        id: string,
   *        username: string,
   *        discord: Object | null
   *      }[]}
   */
  const result = [];

  const exploded = input.split(" ");

  const robloxUsernames = [];
  const unresolvedUsers = [];

  for (const explosion of exploded) {
    // remove anything that is not a letter, number or underscore
    let probableUser = explosion.trim().replace(/[^a-zA-Z0-9_]/g, "");

    //check whether the string is a number or not
    if (!isNaN(parseInt(probableUser))) {
      // if probableUser is a number, check whether that's a Discord user
      var member = null;
      try {
        member = await interaction.guild.members.fetch(probableUser);
      } catch (e) {
        // if the number is not a discord user id, push it to unresolved users since it can be a roblox username (in the past, roblox usernames could be numbers only)
        robloxUsernames.push(probableUser);
      }

      if (member) {
        let rowifiProbableUserResult = await getRowifi(probableUser, client);
        if (!rowifiProbableUserResult.success) {
          return {
            success: false,
            users: [],
            error: `Seems like <@${probableUser}> is not verified with RoWifi or is not in the server. Ensure each subject is verified and in your server when requesting with Discord mentions. You can still use Roblox usernames regardless of being in the server/RoWifi verification \nError: ${rowifiProbableUserResult.error}`,
          };
        } else {
          // if correctly resolved by RoWifi, push to the results
          result.push({
            id: `${rowifiProbableUserResult.roblox}`,
            username: rowifiProbableUserResult.username,
            discord: member.user,
          });
        }
      }
    } else {
      // if the input is not a number, push it to roblox usernames
      robloxUsernames.push(probableUser);
    }
  }

  const robloxUserObjectsResult = await fetchUserInformationFromUsernames(
    robloxUsernames
  );
  if (!robloxUserObjectsResult.success) {
    return {
      success: false,
      error: `Error occurred when processing Roblox usernames. Ensure correct usernames are provided. \nError: ${robloxUserObjectsResult.error}`,
      users: [],
    };
  }

  robloxUserObjectsResult.users.forEach((user) => {
    result.push({
      id: user.id.toString(),
      username: user.username,
      discord: null,
    });
  });

  return { users: result, success: true, error: null };
};

/**
 * Retrieves the count of friends for a user by their userId.
 * @param {string} userId - The userId of the user.
 * @returns {{
 *   success: boolean,
 *   count?: number,
 *   error?: string
 * }} An object indicating the success or failure of the operation, along with relevant data or error message.
 */
const getFriendsCount = async function (userId) {
  // Check if userId is a number
  if (isNaN(userId)) {
    return { success: false, error: "User ID must be a number" };
  }

  try {
    const response = await fetch(
      `https://friends.roblox.com/v1/users/${userId}/friends/count`
    );
    const data = await response.json();

    if (data.errors) {
      return {
        success: false,
        error: data.errors[0].userFacingMessage || "Something went wrong",
      };
    }

    if (!data.count && data.count !== 0) {
      return {
        success: false,
        error: "Count of friends not found in the response",
      };
    }

    return { success: true, count: data.count };
  } catch (error) {
    return {
      success: false,
      error: "Failed to fetch friends count: " + error.message,
    };
  }
};

module.exports = {
  fetchUserInformationFromUsernames,
  toConsole,
  logToChannel,
  extractIDs,
  awaitButtons,
  awaitMenu,
  getRowifi,
  getGroup,
  paginationEmbed,
  paginationResponses,
  parseTime,
  getRobloxInfoFromDiscordMentionsOrRobloxUsernames,
  getGroupByUserId,
  getFriendsCount,
  interactionEmbed,
  fetchRobloxUserById,
  getNobloxRank,
};
