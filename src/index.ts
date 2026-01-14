import { Client, GatewayIntentBits, Message, TextChannel, Webhook, Events } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers, // Required for correct avatar fetching
        GatewayIntentBits.GuildMessageReactions,
    ],
});

const TWITTER_REGEX = /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/([0-9]+)(?:\?[\w=&-]+)?/g;
const messageOwners = new Map<string, string>();

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

        // Send the new message using the webhook
        const sentMessage = await webhook.send({
            content: newContent,
            username: message.member?.displayName || message.author.username,
            avatarURL: avatarURL,
            files: Array.from(message.attachments.values()), // Forward attachments if any
            allowedMentions: { parse: [] }, // Prevent mass pings
        });

        messageOwners.set(sentMessage.id, message.author.id);

        // Delete the original message
        await message.delete();

    } catch (error) {
        console.error('Error handling message:', error);
    }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message:', error);
            return;
        }
    }

    if (user.bot) return;

    // Check if it's the delete emoji
    if (reaction.emoji.name !== '❌' && reaction.emoji.name !== 'x') return;

    // Check if we track this message
    const originalAuthorId = messageOwners.get(reaction.message.id);
    if (!originalAuthorId) return;

    // Verify ownership
    if (user.id !== originalAuthorId) return;

    try {
        await reaction.message.delete();
        messageOwners.delete(reaction.message.id);
    } catch (error) {
        console.error('Error deleting message via reaction:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);
