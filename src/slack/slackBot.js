import { App } from '@slack/bolt';
import { config } from '../config.js';
import { askHacki } from '../ai/hackiAgent.js';

let botApp = null;

export async function initSlackBot() {
  if (!config.enableSlackBot || !config.slackBotToken || !config.slackAppToken) {
    console.log('[SlackBot] Slack bot listener disabled (tokens not provided or ENABLE_SLACK_BOT=false).');
    return null;
  }

  try {
    botApp = new App({
      token: config.slackBotToken,
      appToken: config.slackAppToken,
      socketMode: true,
      clientOptions: { retryConfig: { retries: 0 } }
    });

    // Listen for mentions (@Hacki what is the newest YSWS?)
    botApp.event('app_mention', async ({ event, say, client }) => {
      console.log(`[SlackBot] Received mention in #${event.channel} from ${event.user}`);
      try {
        // Strip the bot mention tag
        const cleanPrompt = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
        const response = await askHacki(cleanPrompt);

        await say({
          text: response.answer,
          thread_ts: event.thread_ts || event.ts
        });
      } catch (err) {
        console.error('[SlackBot] Error replying to mention:', err.message);
        await say({
          text: "Oops! I ran into an issue finding that answer. Check `https://hackclub.com/team` or `https://ysws.hackclub.com/` in the meantime!",
          thread_ts: event.thread_ts || event.ts
        });
      }
    });

    // Listen for direct messages (DMs)
    botApp.message(async ({ message, say }) => {
      // Only handle direct messages (im) and ignore bot messages
      if (message.channel_type === 'im' && !message.subtype && message.text) {
        console.log(`[SlackBot] Received DM from ${message.user}`);
        try {
          const response = await askHacki(message.text);
          await say({
            text: response.answer,
            thread_ts: message.thread_ts || message.ts
          });
        } catch (err) {
          console.error('[SlackBot] Error replying to DM:', err.message);
        }
      }
    });

    await botApp.start();
    console.log('[SlackBot] Hacki Slack Bot is online and connected via Socket Mode!');
    return botApp;
  } catch (error) {
    console.warn(`[SlackBot] Could not start Slack Bot listener: ${error.message}`);
    return null;
  }
}
