import { Client, GatewayIntentBits, Message, TextChannel, Webhook, Events } from 'discord.js';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
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

        // Send the new message using the webhook
        await webhook.send({
            content: newContent,
            username: message.member?.displayName || message.author.username,
            avatarURL: message.author.displayAvatarURL(),
            files: Array.from(message.attachments.values()), // Forward attachments if any
            allowedMentions: { parse: [] }, // Prevent mass pings
        });

        // Delete the original message
        await message.delete();

    } catch (error) {
        console.error('Error handling message:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);
