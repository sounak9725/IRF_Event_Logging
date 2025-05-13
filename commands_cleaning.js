const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const fs = require('node:fs');
const path = require('node:path');
const utility = require('./utility.json');
const config = require('./config.json');

/**
 * List all guild commands and optionally delete unexpected ones
 * @param {Client} client - The Discord client
 * @param {string} guildId - The ID of the guild to check
 * @param {boolean} [autoCleanup=false] - Automatically remove unexpected commands
 */
async function manageGuildCommands(client, guildId, autoCleanup = false) {
  const rest = new REST({ version: '10' }).setToken(config.bot.token);
  
  try {
    // Fetch existing commands for this guild
    const commands = await rest.get(
      Routes.applicationGuildCommands(client.user.id, guildId)
    );
    
    console.log(`Commands for guild ${guildId}:`);
    
    // Find the ministry/server name from utility.json
    const ministry = utility.ministries.find(m => m.serverID === guildId);
    const expectedCommandNames = ministry 
      ? await getExpectedCommandNames(ministry.name) 
      : [];
    
    for (const command of commands) {
      console.log(`- Command: ${command.name}, ID: ${command.id}`);
      
      // Check if the command is unexpected
      if (autoCleanup && !expectedCommandNames.includes(command.name)) {
        console.log(`Unexpected command found: ${command.name}. Attempting to delete...`);
        
        try {
          await rest.delete(
            Routes.applicationGuildCommand(client.user.id, guildId, command.id)
          );
          console.log(`Deleted unexpected command: ${command.name}`);
        } catch (deleteError) {
          console.error(`Failed to delete command ${command.name}:`, deleteError);
        }
      }
    }
    
    return commands;
  } catch (error) {
    console.error(`Error managing commands for guild ${guildId}:`, error);
    return [];
  }
}

/**
 * Get expected command names for a specific server
 * @param {string} serverName - The name of the server/ministry
 * @returns {Promise<string[]>} - Array of expected command names
 */
async function getExpectedCommandNames(serverName) {
  // Create a safe folder name from the ministry name
  const safeFolderName = serverName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const serverDir = path.join(__dirname, "servers", safeFolderName, "commands");

  if (!fs.existsSync(serverDir)) {
    console.warn(`[CMD-CHECK] No commands directory found for server: ${serverName}`);
    return [];
  }

  const commandFiles = fs.readdirSync(serverDir).filter(file => file.endsWith('.js'));
  
  return commandFiles.map(file => {
    try {
      const command = require(path.join(serverDir, file));
      return command.data ? command.data.name : null;
    } catch (error) {
      console.error(`Failed to load command name from ${file}:`, error);
      return null;
    }
  }).filter(name => name !== null);
}

module.exports = {
  manageGuildCommands,
  getExpectedCommandNames
};