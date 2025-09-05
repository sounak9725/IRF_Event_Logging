const {SlashCommandBuilder, EmbedBuilder, Colors} = require("discord.js");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const {fetchRobloxUserById} = require("../../../functions");
const fetch = require("node-fetch");

module.exports = {
    name: "badges_graph",
    description: "See user's badge chart",
    data: new SlashCommandBuilder()
        .setName("badges_graph")
        .setDescription("See user's badge chart")
        .addStringOption(option => option.setName("robloxid").setDescription("User to lookup").setRequired(true))
        .addBooleanOption(option => option.setName("additional_info").setDescription("Show enemy groups and friends check").setRequired(false)),

    /**
     * @param { Client } client
     * @param {CommandInteraction} interaction
     * @param {CommandInteractionOptionResolver} options
     */
    run: async (client, interaction, options) => {
        const runChannelId = interaction.channel.id;
        const robloxId = options.getString("robloxid");
        const additionalInfo = options.getBoolean("additional_info") || false;

        try {
            const robloxUserResult = await fetchRobloxUserById(robloxId);
            if (!robloxUserResult.success) {
                const errorEmbed = new EmbedBuilder()
                    .setTitle("Error Fetching Roblox User")
                    .setColor(0xFF0000)
                    .setDescription(`Failed to fetch Roblox user with ID ${robloxId}: ${robloxUserResult.error}`);
                
                try {
                    await interaction.reply({ embeds: [errorEmbed] });
                } catch (discordError) {
                    console.error("Failed to send error embed:", discordError);
                    // Try deferred reply as fallback
                    try {
                        await interaction.deferReply();
                        await interaction.editReply({ embeds: [errorEmbed] });
                    } catch (fallbackError) {
                        console.error("All Discord interaction methods failed:", fallbackError);
                    }
                }
                return;
            }
            
            const robloxUser = robloxUserResult.user;

            let initialMessage = `\`\`\`Fetching badge graph for: ${robloxUser.name} (${robloxId})...\n${additionalInfo ? 'Including enemy groups and friends check...' : ''}\`\`\``;
            
            try {
                await interaction.reply(initialMessage);
            } catch (discordError) {
                console.error("Failed to send initial reply:", discordError);
                // Try deferred reply as fallback
                try {
                    await interaction.deferReply();
                    await interaction.editReply({ content: initialMessage });
                } catch (fallbackError) {
                    console.error("All Discord interaction methods failed:", fallbackError);
                    return;
                }
            }

            let accumulatedContent = "```\nFetching badge graph for: " + robloxUser.name + " (" + robloxId + ")...\n" + (additionalInfo ? 'Including enemy groups and friends check...\n' : '') + "```";

            const scriptPath = path.resolve(__dirname, "../../../badges.py");
            const graphsDir = path.resolve(__dirname, "../../../graphs/");
            const imagePath = path.resolve(graphsDir, `${robloxId}.png`);
            const textPath = path.resolve(graphsDir, `${robloxId}.json`);

            if (!fs.existsSync(graphsDir)) {
                fs.mkdirSync(graphsDir);
            }

            // Pass additional_info flag to Python script
            const pythonArgs = ["-u", scriptPath, robloxId, robloxUser.name];
            if (additionalInfo) {
                pythonArgs.push("--additional-info");
            }
            
            const pythonProcess = spawn("python3", pythonArgs);

            const timeout = setTimeout(async () => {
                if (!pythonProcess.killed) {
                    pythonProcess.kill();

                    await (await client.channels.fetch(runChannelId)).send({
                        embeds: [new EmbedBuilder()
                            .setTitle("Timed out")
                            .setColor(Colors.Red)
                            .setDescription("Process timed out after 30 minutes. Try running on Google Colab or locally.")]
                    });

                    [imagePath, textPath].forEach(filePath => {
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }
                    });

                    console.error(`Timeout occurred for ${robloxId}`);
                }
            }, 1800000);

            let outputBuffer = "";
            let lastUpdateTime = Date.now();
            let lastMessage = "";
            let isInEnemyGroupsCheck = false;
            let isInFriendsCheck = false;

            pythonProcess.stdout.on("data", async (data) => {
                const message = data.toString().trim();
                
                // Skip verbose output if additional_info is false
                if (!additionalInfo) {
                    // Only show essential progress messages
                    if (message.includes("Loading badges...") || 
                        message.includes("badges requested") || 
                        message.includes("awarded dates") || 
                        message.includes("Completed")) {
                        
                        if (message !== lastMessage) {
                            outputBuffer += `${message}\n`;
                        }
                    }
                } else {
                    // Show all output including enemy groups and friends check
                    if (message !== lastMessage) {
                        // Track what section we're in
                        if (message.includes("Enemy groups check")) {
                            isInEnemyGroupsCheck = true;
                            isInFriendsCheck = false;
                        } else if (message.includes("Friends check")) {
                            isInEnemyGroupsCheck = false;
                            isInFriendsCheck = true;
                        } else if (message.includes("Loading badges")) {
                            isInEnemyGroupsCheck = false;
                            isInFriendsCheck = false;
                        }

                        outputBuffer += `${message}\n`;
                    }
                }

                const now = Date.now();
                const elapsed = now - lastUpdateTime;

                if (elapsed >= 3000 && outputBuffer.trim()) { // Increased to 3 seconds for less spam
                    accumulatedContent = accumulatedContent.replace(/```[\s\S]*```/, "```\n" + accumulatedContent.replace(/```/g, "").trim() + "\n" + outputBuffer.trim() + "\n```");
                    
                    // Truncate if getting too long (Discord has message limits)
                    if (accumulatedContent.length > 1800) {
                        const lines = accumulatedContent.split('\n');
                        accumulatedContent = "```\n" + lines.slice(-15).join('\n') + "\n```";
                    }
                    
                    try {
                        await interaction.editReply({ content: accumulatedContent });
                    } catch (editError) {
                        console.error("Failed to edit reply during progress update:", editError);
                        // Continue processing, don't break the flow
                    }
                    outputBuffer = "";
                    lastMessage = message;
                    lastUpdateTime = now;
                }
            });

            pythonProcess.stderr.on("data", (data) => {
                const errorMsg = data.toString().trim();
                console.error("Python error:", errorMsg);
                
                // Don't spam Discord with every error, but show important ones
                if (errorMsg.includes("Error") && !errorMsg.includes("WARNING")) {
                    outputBuffer += `Error: ${errorMsg}\n`;
                }
            });

            pythonProcess.on("close", async (code) => {
                clearTimeout(timeout);
                if (code === 0) {
                    let irfDates = [];
                    let totalBadges = 0;
                    let firstBadgeDate = null;

                    try {
                        if (fs.existsSync(textPath)) {
                            const rawJson = JSON.parse(fs.readFileSync(textPath, "utf8"));
                            irfDates = rawJson.irf_badge_dates || [];
                            irfDates = irfDates.map(date => typeof date === "string" ? date.slice(0, 10) : date); // format dates
                            totalBadges = rawJson.total_badges || 0;
                            firstBadgeDate = rawJson.first_badge_date || null;
                            fs.unlinkSync(textPath); // delete JSON file after use
                        }
                    } catch (e) {
                        console.error("Error reading or parsing JSON badge data:", e);
                    }

                    // Post to CDA Discord channel (ID: 1408818130356142190)
                    const cdaChannelId = "1408818130356142190";
                    const cdaChannel = await client.channels.fetch(cdaChannelId);
                    
                    if (!cdaChannel || !cdaChannel.isTextBased()) {
                        console.error("CDA channel not found or not text-based.");
                        return interaction.followUp("Internal error: CDA channel not found.");
                    }

                    let uploadedMessage;
                    try {
                        uploadedMessage = await cdaChannel.send({
                            files: [{ attachment: imagePath, name: `badge_graph_${robloxId}.png` }],
                            content: `Badge graph for ${robloxUser.name} (${robloxId})${additionalInfo ? ' (with additional checks)' : ''}`,
                        });
                    } catch (e) {
                        console.error("Failed to upload image to CDA channel:", e);
                        try {
                            await interaction.followUp("Failed to upload badge image to CDA channel.");
                        } catch (followUpError) {
                            console.error("Failed to send followUp message:", followUpError);
                        }
                        return;
                    }

                    const imageLink = uploadedMessage.attachments.first()?.url;

                    const descriptionParts =
                        `Badges earned by ${robloxUser.name} (${robloxId}).` +
                        (irfDates.length > 0 ?
                            `\n\nIRF Badges (${irfDates.length}):\n${irfDates.map(d => d.slice(0, 10)).join(", ")}` :
                            "\n\nNo IRF badges found") +
                        (firstBadgeDate ? `\nFirst Badge: ${new Date(firstBadgeDate).toISOString().slice(0,10)}` : "") +
                        `\nRoblox Join: ${new Date(robloxUser.created).toISOString().slice(0, 10)}` +
                        (additionalInfo ? `\n\n*Additional security checks performed*` : '');

                    const embed = new EmbedBuilder()
                        .setTitle(`Badge Graph for ${robloxUser.name} (${robloxId})`)
                        .setColor(0x00ff00)
                        .setDescription(descriptionParts)
                        .setImage(imageLink)
                        .setTimestamp(new Date());

                    try {
                        await interaction.followUp({
                            content: `<@${interaction.user.id}>`,
                            embeds: [embed]
                        });
                    } catch (followUpError) {
                        console.error("Failed to send final followUp with embed:", followUpError);
                        // Try sending to the channel directly as fallback
                        try {
                            const channel = await client.channels.fetch(runChannelId);
                            await channel.send({
                                content: `<@${interaction.user.id}> Badge graph completed for ${robloxUser.name}`,
                                embeds: [embed]
                            });
                        } catch (channelError) {
                            console.error("All message sending methods failed:", channelError);
                        }
                    }

                    // Cleanup
                    [imagePath].forEach(filePath => {
                        if (fs.existsSync(filePath)) {
                            fs.unlink(filePath, (err) => {
                                err && console.error(`Failed to delete ${filePath}:`, err);
                            });
                        }
                    });
                } else {
                    console.error(`Python script exited with code ${code}`);
                    accumulatedContent += `\nAn error occurred while generating the badge graph for ${robloxUser.name} (${robloxId}). Exit code: ${code}`;
                    accumulatedContent = "```\n" + accumulatedContent.replace(/```/g, "").trim() + "\n```";
                    try {
                        await interaction.editReply({ content: accumulatedContent });
                    } catch (editError) {
                        console.error("Failed to edit reply with error message:", editError);
                    }
                }
            });
        } catch (error) {
            console.error(error);
            try {
                if(interaction.replied || interaction.deferred){
                    await interaction.followUp("An unexpected error occurred while generating the badge graph.");
                } else {
                    await interaction.reply("An unexpected error occurred while generating the badge graph.");
                }
            } catch (finalError) {
                console.error("Failed to send error message to user:", finalError);
                // Try sending to channel as last resort
                try {
                    const channel = await client.channels.fetch(interaction.channel.id);
                    await channel.send(`<@${interaction.user.id}> An unexpected error occurred while generating the badge graph.`);
                } catch (channelError) {
                    console.error("All error notification methods failed:", channelError);
                }
            }
        }
    }
};