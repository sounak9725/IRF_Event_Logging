/* eslint-disable no-unused-vars */
const { 
  Client, 
  GatewayIntentBits, 
  InteractionType, 
  ActivityType, 
  Collection, 
  EmbedBuilder
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
const { Vote, Participation } = require('./DBModels/election');

const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.GuildMembers,   
    GatewayIntentBits.MessageContent
  ],
  // WebSocket optimization settings
  ws: {
    properties: {
      browser: 'Discord iOS'
    },
    large_threshold: 50,
    compress: true
  }
  // Removed unsupported cache override options that were causing warnings
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
    family: 4
  };

  // Main database connection (existing)
  mongoose.connection.on('connected', () => {
    console.log('Mongoose connected to main database');
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
      console.error(`Failed to connect to main MongoDB after ${MAX_DB_RETRY_ATTEMPTS} attempts.`);
      console.warn('Bot will continue without main database functionality.');
      return false;
    }
    
    try {
      retryCount++;
      await mongoose.connect(config.bot.uri, connectOptions);
      console.log(`Connected to main MongoDB (attempt ${retryCount})`);
      retryCount = 0; // Reset counter on success
      return true;
    } catch (err) {
      console.error(`Failed to connect to main MongoDB (attempt ${retryCount}/${MAX_DB_RETRY_ATTEMPTS})`, err);
      
      if (retryCount < MAX_DB_RETRY_ATTEMPTS) {
        const delay = Math.min(5000 * retryCount, 30000); // Exponential backoff with 30s max
        console.log(`Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return connectWithRetry();
      }
      return false;
    }
  }

  const mainDbResult = await connectWithRetry();
  
  // Second database connection for MP discipline cases
  if (config.bot.uri1) {
    try {
      // Connect to the existing mp_discipline database
      const mpDisciplineConnection = mongoose.createConnection(config.bot.uri1, {
        ...connectOptions,
        dbName: 'mp_discipline' // Explicitly specify the database name
      });
      
      mpDisciplineConnection.on('connected', () => {
        console.log('Connected to existing MP Discipline database: mp_discipline');
      });
      
      mpDisciplineConnection.on('error', (err) => {
        console.error('MP Discipline database connection error:', err);
      });
      
      mpDisciplineConnection.on('disconnected', () => {
        console.warn('MP Discipline database disconnected');
      });
      
      // Store the connection for use in models
      client.mpDisciplineConnection = mpDisciplineConnection;
      
    } catch (err) {
      console.error('Failed to connect to MP Discipline database:', err);
      console.warn('MP Discipline functionality will be limited.');
    }
  } else {
    console.warn('No MP Discipline database URI configured (uri1).');
  }

  return mainDbResult;
}

// Ensure proper election-related indexes and migrate old ones
async function ensureElectionIndexes() {
  try {
    // Create/ensure unique vote index per guild-user
    await Vote.collection.createIndex({ guildId: 1, userId: 1 }, { unique: true, name: 'guild_user_unique' });
  } catch (e) {
    console.error('Failed to ensure Vote index (guild_user_unique):', e);
  }

  try {
    // Ensure participation unique index per user-guild
    await Participation.collection.createIndex({ userId: 1, guildId: 1 }, { unique: true });
  } catch (e) {
    console.error('Failed to ensure Participation index:', e);
  }

  try {
    // Drop legacy index if it exists
    const indexes = await Vote.collection.indexes();
    const legacy = indexes.find(i => i.name === 'userId_1_electionId_1');
    if (legacy) {
      await Vote.collection.dropIndex('userId_1_electionId_1');
      console.log('Dropped legacy Vote index userId_1_electionId_1');
    }
  } catch (e) {
    // Non-fatal if not present
    if (!String(e).includes('index not found')) {
      console.warn('Could not drop legacy Vote index:', e);
    }
  }
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
    
    // Log the shutdown - with proper error handling
    if (ready && client?.user && config?.discord?.logChannel) {
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
function loadCommandsForGuild(guildId) {
  const isAdminServer = guildId === config.discord.adminServerId;
  const commands = [];
  const loadedCommandNames = new Set(); // Track commands loaded for THIS guild only

  // Helper function to load commands from a directory
  function loadCommandsFromDirectory(commandsDir, context = "") {
    if (!fs.existsSync(commandsDir)) return [];
    
    const commandFiles = fs.readdirSync(commandsDir).filter(file => file.endsWith('.js'));
    const loadedCommands = [];
    
    for (const file of commandFiles) {
      try {
        const commandPath = path.join(commandsDir, file);
        delete require.cache[require.resolve(commandPath)];
        const command = require(commandPath);

        if (!command.data) {
          console.warn(`[CMD-LOAD] Command ${file} is missing 'data' property${context}`);
          continue;
        }

        if (!command.run) {
          console.warn(`[CMD-LOAD] Command ${file} is missing a 'run' method${context}`);
          continue;
        }

        // Check if command already exists in THIS guild's loading context
        if (loadedCommandNames.has(command.data.name)) {
          console.warn(`[CMD-LOAD] Command ${command.data.name} already loaded for this guild, skipping duplicate${context}`);
          continue;
        }

        // Add to global commands collection (this will be overwritten by other guilds, but that's fine)
        client.commands.set(command.data.name, command);
        loadedCommands.push(command.data.toJSON());
        loadedCommandNames.add(command.data.name);
        console.log(`[CMD-LOAD] Loaded command: ${command.data.name}${context}`);
        
      } catch (error) {
        console.error(`[CMD-LOAD] Failed to load command from ${file}${context}`, error);
      }
    }
    
    return loadedCommands;
  }

  // First, always load common commands for ALL guilds
  const commonCommandsDir = path.join(__dirname, "servers", "common", "commands");
  console.log(`[CMD-LOAD] Loading common commands for guild: ${guildId}`);
  const commonCommands = loadCommandsFromDirectory(commonCommandsDir, " (common)");
  commands.push(...commonCommands);

  if (isAdminServer) {
    console.log(`[CMD-LOAD] Loading all server-specific commands for admin server: ${guildId}`);

    // Load commands from all server folders (excluding common)
    const serversDir = path.join(__dirname, "servers");
    if (!fs.existsSync(serversDir)) {
      console.warn(`[CMD-LOAD] Servers directory not found: ${serversDir}`);
      return commands;
    }
    
    const serverFolders = fs.readdirSync(serversDir).filter(folder => folder !== 'common');

    for (const folder of serverFolders) {
      const commandsDir = path.join(serversDir, folder, "commands");
      const folderCommands = loadCommandsFromDirectory(commandsDir, ` from ${folder}`);
      commands.push(...folderCommands);
    }

    return commands;
  }

  // Default behavior for non-admin servers - load server-specific commands
  const ministry = utility.ministries.find(m => m.serverID === guildId);
  if (!ministry) {
    console.warn(`[CMD-LOAD] No ministry found for guild ID: ${guildId}, using common commands only`);
    return commands;
  }

  const safeFolderName = ministry.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const serverDir = path.join(__dirname, "servers", safeFolderName, "commands");

  if (!fs.existsSync(serverDir)) {
    console.warn(`[CMD-LOAD] No commands directory found for server: ${ministry.name}, using common commands only`);
    return commands;
  }

  console.log(`[CMD-LOAD] Loading server-specific commands for server: ${ministry.name}`);
  const serverCommands = loadCommandsFromDirectory(serverDir, ` for server: ${ministry.name}`);
  commands.push(...serverCommands);

  return commands;
}

//#region Events
client.once("clientReady", async () => {
try {
  // Setup bot activities (keeping your existing code)
  const activities = [
    "Suman is sleeping",
    "Logging Events",
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
  if (dbOk) {
    await ensureElectionIndexes();
  }
  
  console.log(`Services status: Database: ${dbOk ? 'OK' : 'Limited functionality'}`);

  // Set up REST client for command deployment
  const rest = new REST({ version: '10' }).setToken(config.bot.token);

  // Clear existing commands collection
  client.commands.clear();

  // Register commands for each guild
  for (const guild of client.guilds.cache.values()) {
    const serverId = guild.id;

    // Check if the current server is the admin server
    const isAdminServer = serverId === config.discord.adminServerId;

    try {
      const serverCommands = isAdminServer
        ? loadCommandsForGuild(config.discord.adminServerId) // Load all commands for the admin server
        : loadCommandsForGuild(serverId); // Load specific commands for other servers

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
  
  // Safe logging with error handling
  try {
    if (config?.discord?.logChannel) {
      await toConsole("Client has logged in and is ready", new Error().stack, client);
    } else {
      console.log("[INFO] Log channel not configured, skipping console log");
    }
  } catch (error) {
    console.error("[WARN] Failed to send startup log to Discord:", error.message);
  }
   
} catch (error) {
  console.error('Error during startup:', error);
  
  // Safe error logging
  try {
    if (config?.discord?.logChannel) {
      await toConsole('Failed during startup', error.stack, client);
    }
  } catch (logError) {
    console.error("[WARN] Failed to send error log to Discord:", logError.message);
  }
  
  // Ensure the bot still attempts to continue even if command loading fails
  ready = true;
}
});
  
// Enhanced interaction handling with all rate limiting removed
client.on("interactionCreate", async interaction => {
  if (!ready) {
    try {
      return await interaction.reply({ 
        content: "Bot is still starting up. Please wait a moment.", 
        ephemeral: true 
      });
    } catch (error) {
      console.error("Failed to send startup message:", error);
      return;
    }
  }

  try {
    // Process commands without any rate limit checks
    if (interaction.type === InteractionType.ApplicationCommand) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      
      await handleCommand(command, interaction);
    } else if (interaction.type === InteractionType.ModalSubmit) {
      // Handle deny reason modal specifically
      if (interaction.customId.startsWith('deny_reason_modal_')) {
        const command = client.commands.get('request_inactivity_notice');
        if (command && command.handleDenyModal) {
          await command.handleDenyModal(client, interaction);
        } else {
          await interaction.reply({
            content: 'This modal is no longer available.',
            ephemeral: true
          });
        }
      } else {
        // Handle other modals
        await handleModal(interaction);
      }
    } else if (interaction.type === InteractionType.MessageContextMenu) {
      const command = client.commands.get(interaction.commandName);
      if (command && command.run) {
        await command.run(client, interaction);
      }
    } else if (interaction.type === InteractionType.Autocomplete) {
      const command = client.commands.get(interaction.commandName);
      if (command && command.autocomplete) {
        await command.autocomplete(interaction);
      }
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    
    // Safe error logging
    try {
      if (config?.discord?.logChannel) {
        await toConsole('Interaction handling failed', error.stack, client);
      }
    } catch (logError) {
      console.error("[WARN] Failed to send error log to Discord:", logError.message);
    }

    // Safe error response
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "An error occurred. Please try again later.", ephemeral: true });
      } else if (interaction.deferred) {
        await interaction.editReply({ content: "An error occurred. Please try again later." });
      }
    } catch (replyError) {
      console.error("Failed to send error response:", replyError);
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

  // Safe logging
  try {
    if (config?.discord?.logChannel) {
      await toConsole(
        `${interaction.user.tag} (${interaction.user.id}) ran command \`${interaction.commandName}\`:\n> ${options.join("\n> ") || "No options"}`,
        new Error().stack,
        client
      );
    }
  } catch (logError) {
    console.error("[WARN] Failed to log command usage:", logError.message);
  }

  try {
    await command.run(client, interaction, interaction.options);
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    
    try {
      await interaction.editReply({
        content: "An error occurred while executing the command. Please try again later.",
        components: []
      });
    } catch (replyError) {
      console.error("Failed to send command error response:", replyError);
    }
    
    // Safe error logging
    try {
      if (config?.discord?.logChannel) {
        await toConsole(error.stack, new Error().stack, client);
      }
    } catch (logError) {
      console.error("[WARN] Failed to log command error:", logError.message);
    }
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
    
    // Safe logging
    try {
      if (config?.discord?.logChannel) {
        await toConsole(`No modal found for: ${modalName}`, new Error().stack, client);
      }
    } catch (logError) {
      console.error("[WARN] Failed to log modal not found:", logError.message);
    }
  }
}

// Start the bot
client.login(config.bot.token).catch(error => {
  console.error('Failed to login:', error);
  process.exit(1);
});

// WebSocket performance monitoring
client.ws.on('ready', () => {
  console.log('WebSocket connection established');
});

client.ws.on('close', (event) => {
  console.log(`WebSocket connection closed: ${event.code} - ${event.reason}`);
});

client.ws.on('error', (error) => {
  console.error('WebSocket error:', error);
});

// Performance monitoring
setInterval(() => {
  const wsLatency = client.ws.ping;
  const memoryUsage = process.memoryUsage();
  
  if (wsLatency > 200) {
    console.warn(`High WebSocket latency detected: ${wsLatency}ms`);
  }
  
  if (memoryUsage.heapUsed > 100 * 1024 * 1024) { // 100MB
    console.warn(`High memory usage: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`);
  }
}, 60000); // Check every minute

// Enhanced error handling
process.on("uncaughtException", (err, origin) => {
  if (!ready) {
    console.error("Fatal error during startup:", err, origin);
    return process.exit(14);
  }
  
  // Safe error logging
  try {
    if (config?.discord?.logChannel) {
      toConsole(`Uncaught Exception:\n${err}\nOrigin: ${origin}`, new Error().stack, client);
    }
  } catch (logError) {
    console.error("[WARN] Failed to log uncaught exception:", logError.message);
  }
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
    
    // Safe suppressed error logging
    try {
      if (config?.discord?.logChannel) {
        const channel = client.channels.cache.get(config.discord.logChannel);
        if (channel) {
          await channel.send(`Suppressed error:\n>>> ${error}`);
        }
      }
    } catch (logError) {
      console.error("[WARN] Failed to log suppressed error:", logError.message);
    }
    return;
  }

  // Safe error logging
  try {
    if (config?.discord?.logChannel) {
      await toConsole(`Unhandled Rejection:\n${error}`, new Error().stack, client);
    }
  } catch (logError) {
    console.error("[WARN] Failed to log unhandled rejection:", logError.message);
  }
});

process.on("warning", async (warning) => {
  if (!ready) {
    console.warn("Startup warning:", warning);
    return;
  }
  
  // Safe warning logging
  try {
    if (config?.discord?.logChannel) {
      await toConsole(`Warning:\n${warning}`, new Error().stack, client);
    }
  } catch (logError) {
    console.error("[WARN] Failed to log warning:", logError.message);
  }
});

process.on("exit", (code) => {
  console.error(`Process exiting with code: ${code}`);
});