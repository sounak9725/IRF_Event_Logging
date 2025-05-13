/* eslint-disable no-unused-vars */
const { 
    Client, 
    GatewayIntentBits, 
    InteractionType, 
    ActivityType, 
    Collection, 
    EmbedBuilder,
    Options
  } = require("discord.js");
  const utility = require('./utility.json');
  const { REST } = require('@discordjs/rest');
  const { Routes } = require('discord-api-types/v10');
const { manageGuildCommands } = require('./commands_cleaning.js');
  const { ApplicationCommandOptionType } = require("discord-api-types/v10");
  const { interactionEmbed, toConsole } = require("./functions.js");
  const fs = require("node:fs");
  const config = require("./config.json");
  const noblox = require("noblox.js");
  const mongoose = require('mongoose');
  const path = require("path");
  let ready = false;
  
  const client = new Client({ 
    intents: [
      GatewayIntentBits.Guilds, 
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMessages, 
      GatewayIntentBits.GuildMembers,   
      GatewayIntentBits.MessageContent
    ],
    // Check if Options is defined before using it
    ...(typeof Options !== 'undefined' ? {
      makeCache: Options.cacheWithLimits({
        MessageManager: 50, // Limit cached messages
        UserManager: 100,   // Limit cached users
        GuildMemberManager: 100 // Limit cached guild members
      }),
      sweepers: {
        // Automatically clean up unused cache
        messages: {
          interval: 3600, // Every hour
          lifetime: 1800  // Remove messages older than 30 minutes
        },
        users: {
          interval: 3600,
          filter: () => user => !user.bot && Date.now() - user.lastMessageTimestamp > 3600000
        }
      }
    } : {})
  });
  
  const restrictedRoles = new Map();
  client.commands = new Collection();
  client.modals = new Collection();
  module.exports = { restrictedRoles };
  
  // Removed unused messageLogs Map
  const actionLog = new Map(); // Added for tracking moderation actions
  const TIMEFRAME = 10000;
  const MIN_ACCOUNT_AGE = 7 * 24 * 60 * 60 * 1000;
  const MAX_DB_RETRY_ATTEMPTS = 5; // Added to limit database retry attempts
 

  
  
  // Cleanup function for Maps to prevent memory leaks
  function setupCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      
      // Clean up action log
      actionLog.forEach((actions, userId) => {
        const filteredActions = actions.filter(action => now - action.timestamp < 86400000); // 24 hours
        if (filteredActions.length === 0) {
          actionLog.delete(userId);
        } else {
          actionLog.set(userId, filteredActions);
        }
      });
      
      // Removed rate limit cleanup
      
    }, 300000); // Run cleanup every 5 minutes
  }
  
  

  // Database connection with improved retry mechanism and limits
  async function connectDatabase() {
    const connectOptions = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4 // Use IPv4, skip trying IPv6
    };
  
    mongoose.connection.on('connected', () => {
      console.log('Mongoose connected to database');
    });
  
    mongoose.connection.on('error', (err) => {
      console.error('Mongoose connection error:', err);
    });
  
    mongoose.connection.on('disconnected', () => {
      console.warn('Mongoose disconnected, attempting reconnect...');
    });
    
    let retryCount = 0;
    
    async function connectWithRetry() {
      if (retryCount >= MAX_DB_RETRY_ATTEMPTS) {
        console.error(`Failed to connect to MongoDB after ${MAX_DB_RETRY_ATTEMPTS} attempts.`);
        console.warn('Bot will continue without database functionality.');
        return false;
      }
      
      try {
        retryCount++;
        await mongoose.connect(config.bot.uri, connectOptions);
        console.log(`Connected to MongoDB (attempt ${retryCount})`);
        retryCount = 0; // Reset counter on success
        return true;
      } catch (err) {
        console.error(`Failed to connect to MongoDB (attempt ${retryCount}/${MAX_DB_RETRY_ATTEMPTS})`, err);
        
        if (retryCount < MAX_DB_RETRY_ATTEMPTS) {
          const delay = Math.min(5000 * retryCount, 30000); // Exponential backoff with 30s max
          console.log(`Retrying in ${delay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return connectWithRetry();
        }
        return false;
      }
    }
  
    return connectWithRetry();
  }
  
  // Load modals function (added to fix missing modal loading)
  function loadModals() {
    const modalsDir = path.join(__dirname, "modals");
    if (!fs.existsSync(modalsDir)) {
      console.log("[MODAL-LOAD] No modals directory found");
      return;
    }
    
    console.log(`[MODAL-LOAD] Loading from folder: ${modalsDir}`);
    const modalFiles = fs.readdirSync(modalsDir).filter(file => file.endsWith('.js'));
    
    for (const file of modalFiles) {
      try {
        const modal = require(path.join(modalsDir, file));
        client.modals.set(modal.name, modal);
        console.log(`[MODAL-LOAD] Loaded modal: ${modal.name}`);
      } catch (error) {
        console.error(`[MODAL-LOAD] Failed to load modal: ${file}`, error);
      }
    }
  }
  
  // Graceful shutdown handler
  function setupGracefulShutdown() {
    const shutdown = async (signal) => {
      console.log(`Received ${signal}. Shutting down gracefully...`);
      
      // Log the shutdown
      if (ready && client?.user) {
        try {
          await toConsole(`Bot shutdown initiated: ${signal}`, new Error().stack, client);
        } catch (e) {
          console.error('Failed to log shutdown:', e);
        }
      }
      
      // Close database connection
      if (mongoose.connection.readyState !== 0) {
        try {
          await mongoose.connection.close();
          console.log('Database connection closed');
        } catch (e) {
          console.error('Error closing database connection:', e);
        }
      }
      
      // Logout from Discord
      if (client?.isReady()) {
        try {
          await client.destroy();
          console.log('Discord client destroyed');
        } catch (e) {
          console.error('Error destroying Discord client:', e);
        }
      }
      
      console.log('Shutdown complete');
      process.exit(0);
    };
    
    // Register shutdown handlers
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
  
  // Function to load commands for a specific guild
// Function to load commands for a specific guild
function loadCommandsForGuild(guildId) {
  // Find the ministry/server name from utility.json
  const ministry = utility.ministries.find(m => m.serverID === guildId);
  if (!ministry) {
    console.warn(`[CMD-LOAD] No ministry found for guild ID: ${guildId}`);
    return [];
  }

  // Create a safe folder name from the ministry name
  const safeFolderName = ministry.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const serverDir = path.join(__dirname, "servers", safeFolderName, "commands");

  if (!fs.existsSync(serverDir)) {
    console.warn(`[CMD-LOAD] No commands directory found for server: ${ministry.name}`);
    return [];
  }

  console.log(`[CMD-LOAD] Loading commands for server: ${ministry.name}`);
  const commandFiles = fs.readdirSync(serverDir).filter(file => file.endsWith('.js'));
  const commands = [];

  for (const file of commandFiles) {
    try {
      // Clear require cache to prevent potential memory leaks and stale module loads
      const commandPath = path.join(serverDir, file);
      delete require.cache[require.resolve(commandPath)];
      
      const command = require(commandPath);
      
      if (command.data) {
        // Validate command structure
        if (!command.run) {
          console.warn(`[CMD-LOAD] Command ${file} is missing a 'run' method`);
          continue;
        }

        // Store the full command module in the client.commands collection
        client.commands.set(command.data.name, command);
        
        // Convert command to JSON for deployment
        commands.push(command.data.toJSON());
        console.log(`[CMD-LOAD] Loaded command: ${command.data.name} for server: ${ministry.name}`);
      } else {
        console.warn(`[CMD-LOAD] Command ${file} is missing 'data' property`);
      }
    } catch (error) {
      console.error(`[CMD-LOAD] Failed to load command from ${file} for server: ${ministry.name}`, error);
    }
  }

  return commands;
}

//#region Events
client.once("ready", async () => {
  try {
    // Setup bot activities (keeping your existing code)
    const activities = [
      "Suman is sleeping",
      "Staff went on vacation",
    ];
  
    let i = 0;
    client.user.setActivity(activities[0], { type: ActivityType.Watching });
    setInterval(() => {
      client.user.setActivity(activities[i], { type: ActivityType.Watching });
      i = (i + 1) % activities.length;
    }, 14400000); // Change every 4 hours
      
    // Initialize services
    const [dbOk] = await Promise.all([
      connectDatabase(),
      loadModals(),
      setupCacheCleanup(),
      setupGracefulShutdown()
    ]);
    
    console.log(`Services status: Database: ${dbOk ? 'OK' : 'Limited functionality'}`);

    // Set up REST client for command deployment
    const rest = new REST({ version: '10' }).setToken(config.bot.token);

    // Clear existing commands collection
    client.commands.clear();

    // Register commands for each guild
   for (const guild of client.guilds.cache.values()) {
      const serverId = guild.id;
      
      // Pass the client to manageGuildCommands
      await manageGuildCommands(client, serverId, true);

      try {
        const serverCommands = loadCommandsForGuild(serverId);

        // Only attempt to deploy if commands exist for this guild
        if (serverCommands.length > 0) {
          await rest.put(
            Routes.applicationGuildCommands(client.user.id, serverId),
            { body: serverCommands }
          );
          console.log(`[CMD-LOAD] Set ${serverCommands.length} commands for server: ${serverId}`);
        }
      } catch (error) {
        console.error(`[CMD-LOAD] Failed to set commands for server: ${serverId}`, error);
        // Log the detailed error for debugging
        console.error('Detailed error:', error);
      }
    }
    
    ready = true;
    console.log(`${client.user.tag} is online!`);
    toConsole("Client has logged in and is ready", new Error().stack, client);
     
  } catch (error) {
    console.error('Error during startup:', error);
    toConsole('Failed during startup', error.stack, client);
    // Ensure the bot still attempts to continue even if command loading fails
    ready = true;
  }
});
    
  // Enhanced interaction handling with all rate limiting removed
  client.on("interactionCreate", async interaction => {
    if (!ready) return interaction.reply({ 
      content: "Bot is still starting up. Please wait a moment.", 
      ephemeral: true 
    });
  
    try {
      // Process commands without any rate limit checks
      if (interaction.type === InteractionType.ApplicationCommand) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        
        await handleCommand(command, interaction);
      } else if (interaction.type === InteractionType.ModalSubmit) {
        await handleModal(interaction);
      } else if (interaction.type === InteractionType.MessageContextMenu) {
        const command = client.commands.get(interaction.commandName);
        await command.run(client, interaction);
      } else if (interaction.type === InteractionType.Autocomplete) {
        const command = client.commands.get(interaction.commandName);
        await command.autocomplete(interaction);
      }
    } catch (error) {
      console.error('Error handling interaction:', error);
      toConsole('Interaction handling failed', error.stack, client);
  
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "An error occurred. Please try again later.", ephemeral: true });
      } else if (interaction.deferred) {
        await interaction.editReply({ content: "An error occurred. Please try again later." });
      }
    }
  });
  
  async function handleCommand(command, interaction) {
    const options = [];
    if (interaction.options.data.length > 0) {
      for (const option of interaction.options.data) {
        options.push(`[${ApplicationCommandOptionType[option.type]}] ${option.name}: ${option.value}`);
      }
    }
  
    toConsole(
      `${interaction.user.tag} (${interaction.user.id}) ran command \`${interaction.commandName}\`:\n> ${options.join("\n> ") || "No options"}`,
      new Error().stack,
      client
    );
  
    try {
      await command.run(client, interaction, interaction.options);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      await interaction.editReply({
        content: "An error occurred while executing the command. Please try again later.",
        components: []
      });
      toConsole(error.stack, new Error().stack, client);
    }
  }
  
  async function handleModal(interaction) {
    const modalName = interaction.customId;
    const modal = client.modals.get(modalName);
    
    if (modal) {
      try {
        await modal.run(client, interaction, interaction.fields);
      } catch (error) {
        console.error(`Error handling modal ${modalName}:`, error);
        await interaction.reply({
          content: "An error occurred while processing the modal. Please try again later.",
          ephemeral: true
        });
      }
    } else {
      await interaction.reply({
        content: "This modal is no longer available.",
        ephemeral: true
      });
      console.warn(`No modal found for: ${modalName}`);
      toConsole(`No modal found for: ${modalName}`, new Error().stack, client);
    }
  }

  // Start the bot
  client.login(config.bot.token).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
  });
  
  // Enhanced error handling
  process.on("uncaughtException", (err, origin) => {
    if (!ready) {
      console.error("Fatal error during startup:", err, origin);
      return process.exit(14);
    }
    toConsole(`Uncaught Exception:\n${err}\nOrigin: ${origin}`, new Error().stack, client);
  });
  
  process.on("unhandledRejection", async (reason, promise) => {
    if (!ready) {
      console.error("Fatal error during startup:", reason);
      return process.exit(15);
    }
  
    const error = String(reason?.stack || reason);
    if (error.includes("Interaction has already been acknowledged.") ||
        error.includes("Unknown interaction") ||
        error.includes("Unknown Message") ||
        error.includes("Cannot read properties of undefined (reading 'ephemeral')")) {
      return client.channels.cache.get(config.discord.logChannel)
        .send(`Suppressed error:\n>>> ${error}`);
    }
  
    toConsole(`Unhandled Rejection:\n${error}`, new Error().stack, client);
  });
  
  process.on("warning", async (warning) => {
    if (!ready) {
      console.warn("Startup warning:", warning);
      return;
    }
    toConsole(`Warning:\n${warning}`, new Error().stack, client);
  });
  
  process.on("exit", (code) => {
    console.error(`Process exiting with code: ${code}`);
  });