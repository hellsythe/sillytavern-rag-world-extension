import {
  initSettings,
  getSettings,
  getSettingsHost,
  getCurrentChatId,
  getWorldIdForChat,
} from './src/settings.js';
import {
  fetchRagContext,
  fetchWorldState,
  completeTurn,
  bootstrapSession,
  testBackend,
} from './src/api.js';
import { mountDebugPanel, renderDebug } from './src/debug.js';

const EXTENSION_NAME = 'rag-worldstate-bridge';
const bootstrappedSessions = new Set();

async function ensureSessionBootstrap(settings, sessionId) {
  const worldId = getWorldIdForChat(settings, getCurrentChatId());
  if (!settings.autoBootstrap || !worldId) {
    return;
  }

  const key = `${sessionId}:${worldId}`;
  if (bootstrappedSessions.has(key)) {
    return;
  }

  await bootstrapSession(settings, sessionId, worldId, false);
  bootstrappedSessions.add(key);
}

function buildContextBlock(worldState, chunks) {
  const worldLines = [];
  if (worldState?.summary) {
    worldLines.push(`Summary: ${worldState.summary}`);
  }
  if (worldState?.variables && Object.keys(worldState.variables).length > 0) {
    const pairs = Object.entries(worldState.variables).map(([k, v]) => `${k}=${v}`);
    worldLines.push(`Variables: ${pairs.join(', ')}`);
  }

  const chunkLines = (chunks || []).map(
    (chunk, i) => `${i + 1}) (${Number(chunk.score ?? 0).toFixed(3)}) ${chunk.content}`,
  );

  const worldBlock = worldLines.length ? worldLines.join('\n') : 'Summary: none';
  const ragBlock = chunkLines.length ? chunkLines.join('\n') : 'No relevant chunks.';
  return `[WORLD STATE]\n${worldBlock}\n\n[RELEVANT CONTEXT]\n${ragBlock}`;
}

async function injectContextIntoInput() {
  const settings = {
    ...getSettings(),
    onDebug: (endpoint, payload) => renderDebug(getSettings().debug, endpoint, payload),
  };
  const textarea = document.querySelector('#send_textarea');
  if (!textarea) {
    return;
  }

  const message = textarea.value?.trim();
  if (!message) {
    return;
  }

  const sessionId = settings.sessionPrefix + (window?.chat_metadata?.chat_id || 'default-chat');
  await ensureSessionBootstrap(settings, sessionId);
  const [rag, world] = await Promise.all([
    fetchRagContext(settings, sessionId, message),
    fetchWorldState(settings, sessionId),
  ]);

  const contextBlock = buildContextBlock(world, rag?.chunks || []);
  if (textarea.value.includes('[WORLD STATE]')) {
    return;
  }

  textarea.value = `${contextBlock}\n\n${textarea.value}`;
}

async function runTurnCompleteHook() {
  const settings = {
    ...getSettings(),
    onDebug: (endpoint, payload) => renderDebug(getSettings().debug, endpoint, payload),
  };
  if (!settings.autoTurnComplete) {
    return;
  }

  const sessionId = settings.sessionPrefix + (window?.chat_metadata?.chat_id || 'default-chat');
  await ensureSessionBootstrap(settings, sessionId);
  const sceneId = `scene-${Date.now()}`;
  const context = window?.context || {};
  const chat = context?.chat || [];
  const user = chat.at(-2)?.mes || '';
  const assistant = chat.at(-1)?.mes || '';

  if (!user || !assistant) {
    return;
  }

  await completeTurn(settings, {
    sessionId,
    sceneId,
    userMessage: user,
    assistantMessage: assistant,
  });
}

function registerSlashCommand() {
  const parser = window?.SlashCommandParser;
  const named = window?.SlashCommandNamedArgument;
  const closure = window?.SlashCommandClosure;
  if (!parser || !named || !closure) {
    return;
  }

  parser.addCommandObject(
    window.SlashCommand.fromProps({
      name: 'ragctx',
      helpString: 'Fetch RAG context and prepend it into chat input.',
      unnamedArgumentList: [],
      namedArgumentList: [
        new named('prompt', 'Prompt to retrieve context for', [window.ARGUMENT_TYPE.STRING], false),
      ],
      callback: async (_, namedArgs) => {
        const textarea = document.querySelector('#send_textarea');
        if (!textarea) {
          return 'No input box found.';
        }
        if (namedArgs.prompt) {
          textarea.value = namedArgs.prompt;
        }
        await injectContextIntoInput();
        return 'Context injected.';
      },
    }),
  );
}

jQuery(async () => {
  initSettings(EXTENSION_NAME);
  mountDebugPanel(getSettingsHost(), async () => {
    const settings = {
      ...getSettings(),
      onDebug: (endpoint, payload) => renderDebug(getSettings().debug, endpoint, payload),
    };
    await testBackend(settings);
  });
  registerSlashCommand();

  document.addEventListener('keydown', async (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      try {
        await injectContextIntoInput();
      } catch (error) {
        console.error(`[${EXTENSION_NAME}] context injection failed`, error);
      }
    }
  });

  document.addEventListener('message_sent', async () => {
    try {
      await runTurnCompleteHook();
    } catch (error) {
      console.error(`[${EXTENSION_NAME}] turn complete failed`, error);
    }
  });
});
