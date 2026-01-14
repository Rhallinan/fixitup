import { Client, GatewayIntentBits, Message, TextChannel, Webhook, Events, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // Required for correct avatar fetching
    ],
});

const TWITTER_REGEX = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/([0-9]+)(?:\?[\w=&-]+)?/g;

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}!`);
});

client.on(Events.MessageCreate, async (message: Message) => {
    // Ignore messages from bots/webhooks to prevent loops
    if (message.author.bot || message.webhookId) return;

    // Check for Twitter/X links
    const matches = message.content.match(TWITTER_REGEX);
    if (!matches) return;

    try {
        const channel = message.channel as TextChannel;
        if (!channel.isTextBased() || channel.isDMBased()) return;

        // Create new content with replaced links
        let newContent = message.content.replace(TWITTER_REGEX, (match) => {
            return match.replace(/twitter\.com|x\.com/, 'fixupx.com');
        });

        // Find or create a webhook
        const webhooks = await channel.fetchWebhooks();
        let webhook = webhooks.find((wh) => wh.owner?.id === client.user?.id);

        if (!webhook) {
            webhook = await channel.createWebhook({
                name: 'FixupBot Webhook',
                avatar: client.user?.displayAvatarURL(),
            });
        }

        // Determine the best avatar URL
        const avatarURL = message.member?.displayAvatarURL({ extension: 'png', size: 1024 })
            || message.author.displayAvatarURL({ extension: 'png', size: 1024 });

        console.log(`Replacing message from ${message.author.tag}. Using Avatar URL: ${avatarURL}`);

        // Create the Delete button
        const deleteButton = new ButtonBuilder()
            .setCustomId(`fixup_delete_${message.author.id}`)
            .setLabel('Delete')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️');

        const row = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(deleteButton);

        // Send the new message using the webhook
        await webhook.send({
            content: newContent,
            username: message.member?.displayName || message.author.username,
            avatarURL: avatarURL,
            files: Array.from(message.attachments.values()), // Forward attachments if any
            allowedMentions: { parse: [] }, // Prevent mass pings
            components: [row],
        });

        // Delete the original message
        await message.delete();

    } catch (error) {
        console.error('Error handling message:', error);
    }
});

client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isButton()) return;

    if (interaction.customId.startsWith('fixup_delete_')) {
        const allowedUserId = interaction.customId.split('_')[2];

        if (interaction.user.id !== allowedUserId) {
            await interaction.reply({
                content: 'You can only delete your own messages.',
                ephemeral: true,
            });
            return;
        }

        try {
            await interaction.message.delete();
            // Acknowledge the interaction to prevent "This interaction failed"
            // Since we deleted the message, we can catch the error if reply fails, 
            // or just rely on the delete. But it's good practice to try to update or reply if possible,
            // but for deletion, typically just deleting is fine. 
            // However, discord might expect an answer. 
            // We can try to reply ephemeral confirmation or just let it be.
            // Actually, deferUpdate is best if we are deleting the message the button is on.
            // But since the message is gone, we can't really update it.
            // Often just deleting is enough, checking documentation/experience.
            // Actually, if we delete the message, the interaction is technically "handled" or becomes invalid.
            // Let's try to just delete.

        } catch (error) {
            console.error('Error deleting message:', error);
            // If the message was already deleted or some other error
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'Failed to delete message. It may have already been deleted.',
                    ephemeral: true
                });
            }
        }
    }
});

client.login(process.env.DISCORD_TOKEN);
