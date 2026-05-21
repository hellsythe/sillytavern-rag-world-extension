import {
  initSettings,
  getSettings,
  getSettingsHost,
  getCurrentChatId,
  getWorldIdForChat,
  renderSettings,
} from './src/settings.js';
import {
  fetchRagContext,
  fetchWorldState,
  completeTurn,
  bootstrapSession,
  testBackend,
} from './src/api.js';
import { mountDebugPanel, renderDebug, setInjectionMode } from './src/debug.js';

const EXTENSION_NAME = 'rag-worldstate-bridge';
const bootstrappedSessions = new Set();
let lastCompletedTurnKey = '';
let lastContextBlock = '';

function getContext() {
  return globalThis.SillyTavern?.getContext?.() || null;
}

function getEventTypes(context) {
  return context?.event_types || context?.eventTypes || null;
}

function setPromptExtensionBlock(content) {
  const setExtensionPrompt = globalThis?.setExtensionPrompt;
  if (typeof setExtensionPrompt !== 'function') {
    return false;
  }

  try {
    setExtensionPrompt(EXTENSION_NAME, content || '', 1, 0, false);
    return true;
  } catch (error) {
    console.warn(`[${EXTENSION_NAME}] setExtensionPrompt failed`, error);
    return false;
  }
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

function buildSettingsWithDebug() {
  return {
    ...getSettings(),
    onDebug: (endpoint, payload) => renderDebug(getSettings().debug, endpoint, payload),
  };
}

async function ensureSessionBootstrap(settings, sessionId) {
  const worldId = getWorldIdForChat(settings);
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

async function fetchAndApplyContext(promptText) {
  const settings = buildSettingsWithDebug();
  const sessionId = `${settings.sessionPrefix}${getCurrentChatId()}`;
  await ensureSessionBootstrap(settings, sessionId);

  const [rag, world] = await Promise.all([
    fetchRagContext(settings, sessionId, promptText),
    fetchWorldState(settings, sessionId),
  ]);

  const contextBlock = buildContextBlock(world, rag?.chunks || []);
  lastContextBlock = contextBlock;
  const mode = setPromptExtensionBlock(contextBlock) ? 'extension-prompt' : 'none';
  setInjectionMode(mode);

  renderDebug(getSettings().debug, 'inject/context', {
    ok: true,
    status: 200,
    latencyMs: 0,
    request: { mode, sessionId },
    response: { chars: contextBlock.length },
  });
}

async function runTurnCompleteHook() {
  const settings = buildSettingsWithDebug();
  if (!settings.autoTurnComplete) {
    return;
  }

  const context = getContext();
  const chat = context?.chat || [];
  const user = chat.at(-2)?.mes || '';
  const assistant = chat.at(-1)?.mes || '';
  if (!user || !assistant) {
    return;
  }

  const sessionId = `${settings.sessionPrefix}${getCurrentChatId()}`;
  await ensureSessionBootstrap(settings, sessionId);

  const dedupeKey = `${sessionId}::${user.slice(0, 120)}::${assistant.slice(0, 120)}`;
  if (dedupeKey === lastCompletedTurnKey) {
    return;
  }

  await completeTurn(settings, {
    sessionId,
    sceneId: `scene-${Date.now()}`,
    userMessage: user,
    assistantMessage: assistant,
  });
  lastCompletedTurnKey = dedupeKey;
}

globalThis.ragWorldstateGenerateInterceptor = async function (chat) {
  const prompt = [...chat].reverse().find((message) => message?.is_user)?.mes || '';
  if (!prompt) {
    return;
  }

  try {
    await fetchAndApplyContext(prompt);
  } catch (error) {
    console.error(`[${EXTENSION_NAME}] interceptor failed`, error);
  }
};

function registerSlashCommand() {
  const parser = globalThis?.SlashCommandParser;
  const named = globalThis?.SlashCommandNamedArgument;
  if (!parser || !named || !globalThis?.SlashCommand) {
    return;
  }

  parser.addCommandObject(
    globalThis.SlashCommand.fromProps({
      name: 'ragctx',
      helpString: 'Fetch RAG context and bind it to generation prompt.',
      unnamedArgumentList: [],
      namedArgumentList: [
        new named('prompt', 'Prompt to retrieve context for', [globalThis.ARGUMENT_TYPE.STRING], false),
      ],
      callback: async (_, namedArgs) => {
        const prompt = namedArgs.prompt || getContext()?.chat?.at(-1)?.mes || '';
        if (!prompt) {
          return 'No prompt text found.';
        }
        await fetchAndApplyContext(prompt);
        return 'Context loaded for next generation.';
      },
    }),
  );
}

async function onAppReady() {
  initSettings();
  renderSettings();

  mountDebugPanel(getSettingsHost(), async () => {
    await testBackend(buildSettingsWithDebug());
  });

  await testBackend(buildSettingsWithDebug());
  registerSlashCommand();

  const context = getContext();
  const eventTypes = getEventTypes(context);
  if (!context?.eventSource || !eventTypes) {
    return;
  }

  context.eventSource.on(eventTypes.CHAT_CHANGED, async () => {
    const settings = buildSettingsWithDebug();
    const sessionId = `${settings.sessionPrefix}${getCurrentChatId()}`;
    lastCompletedTurnKey = '';
    lastContextBlock = '';
    setPromptExtensionBlock('');
    setInjectionMode('idle');
    await ensureSessionBootstrap(settings, sessionId);
  });

  context.eventSource.on(eventTypes.CHAT_CREATED, async () => {
    lastCompletedTurnKey = '';
  });

  context.eventSource.makeFirst(eventTypes.CHARACTER_MESSAGE_RENDERED, async () => {
    try {
      await runTurnCompleteHook();
    } catch (error) {
      console.error(`[${EXTENSION_NAME}] turn complete failed`, error);
    }
  });

  if (eventTypes.GENERATION_AFTER_COMMANDS) {
    context.eventSource.makeFirst(eventTypes.GENERATION_AFTER_COMMANDS, async () => {
      if (lastContextBlock) {
        setPromptExtensionBlock(lastContextBlock);
        setInjectionMode('extension-prompt');
      }
    });
  }
}

jQuery(async () => {
  const context = getContext();
  const eventTypes = getEventTypes(context);
  if (context?.eventSource && eventTypes?.APP_READY) {
    context.eventSource.on(eventTypes.APP_READY, async () => {
      await onAppReady();
    });
  } else {
    await onAppReady();
  }
});
