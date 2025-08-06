const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Vote, Participation } = require('../../../DBModels/election'); // No need for Admin model now
const { sheets } = require('../../../utils/googleSheetsAuth');

const candidateChoices = [
    // RSDWP
    { name: 'kingleeboi15 (RSDWP)', value: 'kingleeboi15 - RSDWP' },
    { name: 'jydffggf (RSDWP)', value: 'jydffggf - RSDWP' },
    { name: 'Chinese.Judgement (RSDWP)', value: 'Chinese.Judgement - RSDWP' },
    { name: 'kinkrar (RSDWP)', value: 'kinkrar - RSDWP' },
    { name: 'jorstar41 (RSDWP)', value: 'jorstar41 - RSDWP' },
    // ARAMP
    { name: 'Penkuvsky (ARAMP)', value: 'Penkuvsky - ARAMP' },
    { name: 'fbiagent490 (ARAMP)', value: 'fbiagent490 - ARAMP' },
    { name: 'vitkovapofilovka (ARAMP)', value: 'vitkovapofilovka - ARAMP' },
    { name: 'qwertyintent (ARAMP)', value: 'qwertyintent - ARAMP' },
    { name: 'Gabrielpfponi (ARAMP)', value: 'Gabrielpfponi - ARAMP' },
    // CDP
    { name: 'FortniteDab96 (CDP)', value: 'FortniteDab96 - CDP' },
    { name: 'mitroo3 (CDP)', value: 'mitroo3 - CDP' },
    { name: 'darthcosta (CDP)', value: 'darthcosta - CDP' },
    { name: 'LargeMohammed777 (CDP)', value: 'LargeMohammed777 - CDP' },
    { name: 'Salwa4 (CDP)', value: 'Salwa4 - CDP' }
];

module.exports = {
    name: 'vote',
    description: 'Vote for a candidate in the current election',
    data: new SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote for a candidate in the current election')
        .addStringOption(option =>
            option.setName('candidate')
                .setDescription('Select your candidate')
                .setRequired(true)
                .addChoices(...candidateChoices)
        ),

    async run(client, interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });

            const candidateChoice = interaction.options.getString('candidate');
            const userId = interaction.user.id;
            const username = interaction.user.username;
            const guildId = interaction.guild.id;

            // Parse candidate and party
            const [candidateName, party] = candidateChoice.split(' - ');
            if (!candidateName || !party) {
                return await interaction.editReply({
                    content: '❌ Invalid candidate format. Please select a candidate from the dropdown.',
                    ephemeral: true
                });
            }

            // Check if user has already voted
            const existingVote = await Vote.findOne({ userId, guildId });
            if (existingVote) {
                return await interaction.editReply({
                    content: `❌ You have already voted in this election. Your vote was for: **${existingVote.candidateName} - ${existingVote.party}**`,
                    ephemeral: true
                });
            }

            // Create vote record
            const vote = new Vote({
                userId,
                username,
                candidateName,
                party,
                guildId
            });

            await vote.save();

            // Update or create participation record
            let participation = await Participation.findOne({ userId, guildId });
            if (participation) {
                participation.lastParticipation = new Date();
                await participation.save();
            } else {
                const newParticipation = new Participation({
                    userId,
                    username,
                    guildId,
                    lastParticipation: new Date()
                });
                await newParticipation.save();
            }

            // Confirmation embed
            const voteEmbed = new EmbedBuilder()
                .setTitle('✅ Vote Recorded Successfully!')
                .setColor('#00ff00')
                .setDescription(`Your vote has been recorded for this election.`)
                .addFields(
                    { name: '👤 Candidate', value: candidateName, inline: true },
                    { name: '🏛️ Party', value: party, inline: true }
                )
                .setFooter({
                    text: `Voter: ${username}`,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .setTimestamp();

            await interaction.editReply({
                embeds: [voteEmbed],
                ephemeral: true
            });

            // Log to Google Sheet
            try {
                const robloxUsername = username; // Replace with actual Roblox username if available
                const sheetId = "1lrNPtGL6ziBus9Y5l6fg8NXYvUggmDEZAyUQRyZsdgg";
                const sheetName = "Election Raw Data";
                const timestamp = new Date().toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });

                await sheets.spreadsheets.values.append({
                    spreadsheetId: sheetId,
                    range: `${sheetName}!A:D`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [
                            [
                                timestamp,           // A: Time Stamp
                                robloxUsername,      // B: Roblox Username
                                candidateName,       // C: Candidate Name
                                party                // D: Candidate Party Association
                            ]
                        ]
                    }
                });
            } catch (err) {
                console.error('Failed to log vote to Google Sheet:', err);
            }

        } catch (error) {
            console.error('Error in vote command:', error);

            // Handle duplicate vote error
            if (error.code === 11000) {
                await interaction.editReply({
                    content: '❌ You have already voted in this election. You cannot vote again.',
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: '❌ An error occurred while recording your vote. Please try again later.',
                    ephemeral: true
                });
            }
        }
    }
};