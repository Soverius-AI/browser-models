/**
 * Source files shown on the site, read from the repository at build time: the tested snippets
 * (libs/examples/snippets) on the front page, the examples' code in the playground. The code
 * on the site is the code that runs.
 */
export const SOURCE_FILES = {
  snippets: [
    'libs/examples/snippets/src/chat.ts',
    'libs/examples/snippets/src/agent.ts',
    'libs/examples/snippets/src/tools.ts',
    'libs/examples/snippets/src/copilotkit.tsx',
  ],
  engine: [
    'apps/engine-chat/src/app/engines.ts',
    'apps/engine-chat/src/app/conversation.ts',
    'apps/engine-chat/src/main.ts',
  ],
  agent: ['apps/agent-chat/src/app/agent.ts', 'apps/agent-chat/src/main.ts'],
  vanilla: [
    'apps/vanilla-agui/src/app/agent.ts',
    'apps/vanilla-agui/src/app/chat.ts',
  ],
  angular: [
    'apps/angular-copilotkit/src/app/agent.ts',
    'apps/angular-copilotkit/src/app/app.ts',
    'apps/angular-copilotkit/src/app/app.html',
    'apps/angular-copilotkit/src/app/copilotkit-docs/register-docs-examples.ts',
  ],
  react: [
    'apps/react-copilotkit/src/app/agent.ts',
    'apps/react-copilotkit/src/app/app.tsx',
    'apps/react-copilotkit/src/app/copilotkit-docs/todo-manager.tsx',
  ],
  vue: [
    'apps/vue-copilotkit/src/app/agent.ts',
    'apps/vue-copilotkit/src/app/ChatPage.vue',
    'apps/vue-copilotkit/src/app/copilotkit-docs/TodoManager.vue',
  ],
  assistant: [
    'apps/docs-assistant/src/app/agent.ts',
    'apps/docs-assistant/src/app/docs-tools.tsx',
    'apps/docs-assistant/src/app/docs-index.ts',
  ],
} as const;
