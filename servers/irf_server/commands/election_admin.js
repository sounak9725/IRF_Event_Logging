const { SlashCommandBuilder, EmbedBuilder, MessageFlags, CommandInteraction, CommandInteractionOptionResolver } = require('discord.js');
const { Admin, Vote, Participation } = require('../../../DBModels/election'); 
const { interactionEmbed } = require('../../../functions'); 
const config = require('../../../config.json');

// Define your required role IDs here
const requiredRoles = ['1049072890919800873', '450434193206411277', '660676336276340757', '1129468969779204209'];

module.exports = {
    name: 'election_admin',
    description: 'Admin commands for managing elections',
    data: new SlashCommandBuilder()
        .setName('election_admin')
        .setDescription('Admin commands for managing elections')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add_party')
                .setDescription('Add a new party')
                .addStringOption(option =>
                    option.setName('party_name')
                        .setDescription('Full name of the party')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('party_code')
                        .setDescription('Party code/abbreviation (e.g., RSDP)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add_candidate')
                .setDescription('Add a new candidate')
                .addStringOption(option =>
                    option.setName('candidate_name')
                        .setDescription('Name of the candidate')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('party')
                        .setDescription('Party the candidate belongs to')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Constitutional Democratic Party', value: 'Constitutional Democratic Party' },
                            { name: 'All Russian Autocratic Monarchist Party', value: 'All Russian Autocratic Monarchist Party' },
                            { name: 'Russian Social Democratic Worker\'s Party', value: 'Russian Social Democratic Workers\' Party' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove_candidate')
                .setDescription('Remove a candidate')
                .addStringOption(option =>
                    option.setName('candidate_name')
                        .setDescription('Name of the candidate to remove')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list_candidates')
                .setDescription('List all candidates')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list_parties')
                .setDescription('List all parties')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('election_status')
                .setDescription('Check current election status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset_votes')
                .setDescription('Reset all votes (DANGEROUS)')
                .addBooleanOption(option =>
                    option.setName('confirm')
                        .setDescription('Confirm the reset (set to true)')
                        .setRequired(true)
                )
        ),
    /**
   * @param {Client} client
   * @param {CommandInteraction} interaction
   */ 
    run: async(client, interaction) =>{
        try {
            await interaction.deferReply({ ephemeral: true });

            const subcommand = interaction.options.getSubcommand();

            // Owner-only gate for reset_votes subcommand
            if (subcommand === 'reset_votes') {
                const ownerId = config?.discord?.ownerId;
                if (ownerId) {
                    if (interaction.user.id !== ownerId) {
                        return await interaction.editReply({
                            content: 'No bro u cant do that lmao,',
                            ephemeral: true
                        });
                    }
                } else {
                    // If ownerId is not configured, fall back to role-based permission
                    const hasRoleForFallback = requiredRoles.some(roleId => interaction.member.roles.cache.has(roleId));
                    if (!hasRoleForFallback) {
                        return interactionEmbed(3, "[ERR-UPRM]", '', interaction, client, [true, 30]);
                    }
                }
            } else {
                // Role-based permission check for all other subcommands
                const hasRole = requiredRoles.some(roleId => interaction.member.roles.cache.has(roleId));
                if (!hasRole) {
                    return interactionEmbed(3, "[ERR-UPRM]", '', interaction, client, [true, 30]);
                }
            }

            // Find or create admin document
            let adminDoc = await Admin.findOne();
            if (!adminDoc) {
                adminDoc = new Admin();
                await adminDoc.save();
            }

            switch (subcommand) {
                case 'add_party':
                    await handleAddParty(interaction, adminDoc);
                    break;
                case 'add_candidate':
                    await handleAddCandidate(interaction, adminDoc);
                    break;
                case 'remove_candidate':
                    await handleRemoveCandidate(interaction, adminDoc);
                    break;
                case 'list_candidates':
                    await handleListCandidates(interaction, adminDoc);
                    break;
                case 'list_parties':
                    await handleListParties(interaction, adminDoc);
                    break;
                case 'election_status':
                    await handleElectionStatus(interaction, adminDoc);
                    break;
                case 'reset_votes':
                    await handleResetVotes(interaction, adminDoc);
                    break;
                default:
                    await interaction.editReply({
                        content: '❌ Unknown subcommand.',
                        ephemeral: true
                    });
            }

        } catch (error) {
            console.error('Error in election_admin command:', error);
            await interaction.editReply({
                content: '❌ An error occurred while executing the admin command. Please try again later.',
                ephemeral: true
            });
        }
    }
};

async function handleAddParty(interaction, adminDoc) {
    const partyName = interaction.options.getString('party_name');
    const partyCode = interaction.options.getString('party_code').toUpperCase();

    // Check if party already exists
    const existingParty = adminDoc.parties.find(p => 
        p.partyName.toLowerCase() === partyName.toLowerCase() || 
        p.partyCode === partyCode
    );

    if (existingParty) {
        return await interaction.editReply({
            content: '❌ A party with this name or code already exists.',
            ephemeral: true
        });
    }

    adminDoc.parties.push({ partyName, partyCode });
    await adminDoc.save();

    await interaction.editReply({
        content: `✅ Party added successfully!\n**Name:** ${partyName}\n**Code:** ${partyCode}`,
        ephemeral: true
    });
}

async function handleAddCandidate(interaction, adminDoc) {
    const candidateName = interaction.options.getString('candidate_name');
    const party = interaction.options.getString('party');

    // Check if candidate already exists
    const existingCandidate = adminDoc.candidates.find(c => 
        c.candidateName.toLowerCase() === candidateName.toLowerCase() && c.party === party
    );

    if (existingCandidate) {
        return await interaction.editReply({
            content: `❌ Candidate "${candidateName}" already exists for party "${party}".`,
            ephemeral: true
        });
    }

    adminDoc.candidates.push({ candidateName, party });
    await adminDoc.save();

    await interaction.editReply({
        content: `✅ Candidate added successfully!\n**Name:** ${candidateName}\n**Party:** ${party}`,
        ephemeral: true
    });
}

async function handleRemoveCandidate(interaction, adminDoc) {
    const candidateName = interaction.options.getString('candidate_name');

    const candidateIndex = adminDoc.candidates.findIndex(c => 
        c.candidateName.toLowerCase() === candidateName.toLowerCase()
    );

    if (candidateIndex === -1) {
        return await interaction.editReply({
            content: `❌ Candidate "${candidateName}" not found.`,
            ephemeral: true
        });
    }

    adminDoc.candidates.splice(candidateIndex, 1);
    await adminDoc.save();

    await interaction.editReply({
        content: `✅ Candidate "${candidateName}" removed.`,
        ephemeral: true
    });
}

async function handleListCandidates(interaction, adminDoc) {
    const candidates = adminDoc.candidates;

    if (candidates.length === 0) {
        return await interaction.editReply({
            content: '❌ No candidates found.',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('Candidates List')
        .setColor('#0099ff')
        .setDescription('All Candidates');

    const candidateList = candidates.map(c => `• **${c.candidateName}** - ${c.party}`).join('\n');
    embed.addFields({
        name: 'Candidates',
        value: candidateList,
        inline: false
    });

    await interaction.editReply({ embeds: [embed], ephemeral: true });
}

async function handleListParties(interaction, adminDoc) {
    if (adminDoc.parties.length === 0) {
        return await interaction.editReply({
            content: '❌ No parties found.',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle('Parties List')
        .setColor('#0099ff')
        .setDescription('All registered parties');

    const partyList = adminDoc.parties.map(p => `• **${p.partyName}** (${p.partyCode})`).join('\n');
    embed.addFields({
        name: 'Registered Parties',
        value: partyList,
        inline: false
    });

    await interaction.editReply({ embeds: [embed], ephemeral: true });
}

async function handleResetVotes(interaction, adminDoc) {
    const confirm = interaction.options.getBoolean('confirm');

    if (!confirm) {
        return await interaction.editReply({
            content: '❌ You must set the confirm option to `true` to reset all votes.',
            ephemeral: true
        });
    }

    const guildId = interaction.guild.id;
    console.log(`Starting reset for guild: ${guildId}`);

    try {
        // Debug: List all data before deletion
        console.log('=== PRE-DELETION DEBUG ===');
        
        const allVotes = await Vote.find({ guildId: guildId });
        const allParticipation = await Participation.find({ guildId: guildId });
        
        console.log(`Found ${allVotes.length} votes for guild ${guildId}:`);
        allVotes.forEach((vote, index) => {
            console.log(`  Vote ${index + 1}: User ${vote.userId} voted for ${vote.candidateName} (${vote.party})`);
        });
        
        console.log(`Found ${allParticipation.length} participation records for guild ${guildId}:`);
        allParticipation.forEach((part, index) => {
            console.log(`  Participation ${index + 1}: User ${part.userId} (${part.username})`);
        });

        // Count before deletion
        const votesToDelete = await Vote.countDocuments({ guildId: guildId });
        const participationToDelete = await Participation.countDocuments({ guildId: guildId });
        
        console.log(`About to delete: ${votesToDelete} votes, ${participationToDelete} participation records`);
        
        if (votesToDelete === 0 && participationToDelete === 0) {
            return await interaction.editReply({
                content: `❌ No votes or participation records found for this guild (${guildId}).`,
                ephemeral: true
            });
        }

        // Perform deletions
        console.log('Executing deletions...');
        const voteDeleteResult = await Vote.deleteMany({ guildId: guildId });
        const participationDeleteResult = await Participation.deleteMany({ guildId: guildId });
        
        console.log(`Vote deletion result:`, voteDeleteResult);
        console.log(`Participation deletion result:`, participationDeleteResult);

        // Verify deletion
        console.log('=== POST-DELETION VERIFICATION ===');
        const remainingVotes = await Vote.countDocuments({ guildId: guildId });
        const remainingParticipation = await Participation.countDocuments({ guildId: guildId });
        
        console.log(`Remaining votes: ${remainingVotes}`);
        console.log(`Remaining participation: ${remainingParticipation}`);
        
        if (remainingVotes > 0 || remainingParticipation > 0) {
            console.warn(`⚠️ WARNING: Some data remains after deletion!`);
            
            // List remaining data
            const stillThere = await Vote.find({ guildId: guildId });
            console.log('Remaining votes:', stillThere);
            
            const stillThereParticipation = await Participation.find({ guildId: guildId });
            console.log('Remaining participation:', stillThereParticipation);
        }

        // Reset election status
        adminDoc.isElectionActive = false;
        adminDoc.electionStart = null;
        adminDoc.electionDurationHours = null;
        await adminDoc.save();

        await interaction.editReply({
            content: `✅ **Reset completed!**\n\n` +
                     `**Votes:** ${voteDeleteResult.deletedCount}/${votesToDelete} deleted\n` +
                     `**Participation:** ${participationDeleteResult.deletedCount}/${participationToDelete} deleted\n` +
                     `**Remaining votes:** ${remainingVotes}\n` +
                     `**Remaining participation:** ${remainingParticipation}\n\n` +
                     `${remainingVotes > 0 || remainingParticipation > 0 ? '⚠️ Some data may still remain - check console logs' : '✅ All data successfully removed'}\n\n` +
                     `⚠️ **Warning:** This action cannot be undone.`,
            ephemeral: true
        });

    } catch (error) {
        console.error('Error during vote reset:', error);
        await interaction.editReply({
            content: `❌ An error occurred: ${error.message}\nCheck console for details.`,
            ephemeral: true
        });
    }
}

async function handleResetVotes(interaction, adminDoc) {
    const confirm = interaction.options.getBoolean('confirm');

    if (!confirm) {
        return await interaction.editReply({
            content: '❌ You must set the confirm option to `true` to reset all votes.',
            ephemeral: true
        });
    }

    // Count votes to be deleted
    const votesToDelete = await Vote.countDocuments({ guildId: interaction.guild.id });
    
    if (votesToDelete === 0) {
        return await interaction.editReply({
            content: `❌ No votes found for this election.`,
            ephemeral: true
        });
    }

    // Delete votes for the current election
    await Vote.deleteMany({ guildId: interaction.guild.id });

    // Delete all participation records for this guild
    await Participation.deleteMany({ guildId: interaction.guild.id });

    await interaction.editReply({
        content: `✅ **All votes have been reset successfully!**\n\n` +
                 `**Deleted:** ${votesToDelete} votes\n\n` +
                 `⚠️ **Warning:** This action cannot be undone.`,
        ephemeral: true
    });
}