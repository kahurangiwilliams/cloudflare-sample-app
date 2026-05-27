/**
 * Shaq - Personal AI Workflow Assistant
 * Core server running on Cloudflare Workers
 */

import { AutoRouter } from 'itty-router';
import {
  InteractionResponseType,
  InteractionType,
} from 'discord-interactions';
import { SHAQ_COMMAND } from './commands.js';
import { getTodaysEvents } from './calendar.js';

class JsonResponse extends Response {
  constructor(body, init) {
    const jsonBody = JSON.stringify(body);
    init = init || {
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
    };
    super(jsonBody, init);
  }
}

const router = AutoRouter();

router.get('/', (request, env) => {
  return new Response(`⚡ Shaq is online. App ID: ${env.DISCORD_APPLICATION_ID}`);
});

router.post('/', async (request, env) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(
    request,
    env,
  );
  if (!isValid || !interaction) {
    return new Response('Bad request signature.', { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    return new JsonResponse({
      type: InteractionResponseType.PONG,
    });
  }

  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    switch (interaction.data.name.toLowerCase()) {

      case SHAQ_COMMAND.name.toLowerCase(): {
        const userMessage = interaction.data.options[0].value;

        const deferredResponse = new JsonResponse({
          type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        });

        env.ctx.waitUntil(
          (async () => {
            try {
              const anthropicResponse = await fetch(
                'https://api.anthropic.com/v1/messages',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                  },
                  body: JSON.stringify({
                    model: 'claude-sonnet-4-5',
                    max_tokens: 1024,
                    system: `You are Shaq, a personal AI workflow assistant for Xavier.
Xavier is a sales closer working in a property mentorship community in New Zealand.
You are sharp, direct, and practical. You help Xavier think clearly,
work efficiently, and make better decisions.
Keep responses concise and actionable unless asked to elaborate.`,
                    messages: [
                      {
                        role: 'user',
                        content: userMessage,
                      },
                    ],
                  }),
                },
              );

              const claudeData = await anthropicResponse.json();

              if (!claudeData.content || !claudeData.content[0]) {
                throw new Error('No content in Claude response: ' + JSON.stringify(claudeData));
              }

              const shaqReply = claudeData.content[0].text;

              const webhookUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;

              await fetch(webhookUrl, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  content: shaqReply,
                }),
              });

            } catch (err) {
              console.error('Background task error:', err.message);
            }
          })(),
        );

        return deferredResponse;
      }

      default:
        return new JsonResponse({ error: 'Unknown command' }, { status: 400 });
    }
  }

  console.error('Unknown interaction type');
  return new JsonResponse({ error: 'Unknown Type' }, { status: 400 });
});

router.all('*', () => new Response('Not Found.', { status: 404 }));

/**
 * Morning brief function
 * Called by the cron trigger every day at 8:30am NZT
 */
async function sendMorningBrief(env) {
  try {
    console.log('Fetching calendar events for morning brief...');

    // Get today's events from Google Calendar
    const events = await getTodaysEvents(env);

    // Format events into a readable list for Claude
    let eventsText = '';
    if (events.length === 0) {
      eventsText = 'No events scheduled for today.';
    } else {
      eventsText = events.map(event => {
        const start = event.start?.dateTime || event.start?.date;
        const end = event.end?.dateTime || event.end?.date;
        
        // Format time nicely
        let timeStr = '';
        if (event.start?.dateTime) {
          const startTime = new Date(start).toLocaleTimeString('en-NZ', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Pacific/Auckland',
          });
          const endTime = new Date(end).toLocaleTimeString('en-NZ', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Pacific/Auckland',
          });
          timeStr = `${startTime} - ${endTime}`;
        } else {
          timeStr = 'All day';
        }

        return `- ${timeStr}: ${event.summary || 'Untitled event'}`;
      }).join('\n');
    }

    console.log('Events fetched:', eventsText);

    // Send events to Claude to format into a morning brief
    const anthropicResponse = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 1024,
          system: `You are Shaq, a personal AI workflow assistant for Xavier.
Xavier is a sales closer working in a property mentorship community in New Zealand.
You deliver sharp, energetic morning briefs. Keep it punchy and motivating.
Format the brief clearly with a greeting, the day's schedule, and one short line of focus for the day.
Use Discord markdown formatting — **bold** for times and event names.`,
          messages: [
            {
              role: 'user',
              content: `Here are Xavier's calendar events for today:\n\n${eventsText}\n\nWrite his morning brief.`,
            },
          ],
        }),
      },
    );

    const claudeData = await anthropicResponse.json();

    if (!claudeData.content || !claudeData.content[0]) {
      throw new Error('No content from Claude: ' + JSON.stringify(claudeData));
    }

    const brief = claudeData.content[0].text;
    console.log('Morning brief generated:', brief);

    // Post the brief to Discord
    const discordResponse = await fetch(
      `https://discord.com/api/v10/channels/${env.DISCORD_CHANNEL_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bot ${env.DISCORD_TOKEN}`,
        },
        body: JSON.stringify({
          content: brief,
        }),
      },
    );

    console.log('Discord post status:', discordResponse.status);

  } catch (err) {
    console.error('Morning brief error:', err.message);
  }
}

async function verifyDiscordRequest(request, env) {
  const signature = request.headers.get('x-signature-ed25519');
  const timestamp = request.headers.get('x-signature-timestamp');

  if (!signature || !timestamp) {
    return { isValid: false };
  }

  const body = await request.arrayBuffer();
  const bodyText = new TextDecoder().decode(body);

  const encoder = new TextEncoder();
  const message = encoder.encode(timestamp + bodyText);

  const keyBytes = hexToBytes(env.DISCORD_PUBLIC_KEY);
  const sigBytes = hexToBytes(signature);

  try {
    const publicKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'NODE-ED25519', namedCurve: 'NODE-ED25519' },
      false,
      ['verify'],
    );

    const isValidRequest = await crypto.subtle.verify(
      'NODE-ED25519',
      publicKey,
      sigBytes,
      message,
    );

    if (!isValidRequest) {
      return { isValid: false };
    }

    return { interaction: JSON.parse(bodyText), isValid: true };
  } catch (err) {
    console.error('Verification error:', err);
    return { isValid: false };
  }
}

function hexToBytes(hex) {
  return new Uint8Array(
    hex.match(/.{1,2}/g).map((b) => parseInt(b, 16)),
  );
}

const server = {
  verifyDiscordRequest,
  fetch: async (request, env, ctx) => {
    env.ctx = ctx;
    return router.fetch(request, env, ctx);
  },
  // This is the cron handler - Cloudflare calls this on schedule
  scheduled: async (event, env, ctx) => {
    ctx.waitUntil(sendMorningBrief(env));
  },
};

export default server;