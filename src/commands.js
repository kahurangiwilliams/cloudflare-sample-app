/**
 * Shaq commands
 * Each command defined here gets registered with Discord and
 * becomes available as a slash command in your server.
 */

export const SHAQ_COMMAND = {
  name: 'shaq',
  description: 'Talk to Shaq, your AI workflow assistant.',
  options: [
    {
      name: 'message',
      description: 'What do you want to ask Shaq?',
      type: 3,
      required: true,
    },
  ],
};