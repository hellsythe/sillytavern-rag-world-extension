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
import { mountDebugPanel, renderDebug, setInjectionMode } from './src/debug.js';

const EXTENSION_NAME = 'rag-worldstate-bridge';
const bootstrappedSessions = new Set();
let lastCompletedTurnKey = '';
let isInjecting = false;
let lastContextBlock = '';

function getStRuntime() {
  return {
    eventSource: globalThis?.eventSource,
    event_types: globalThis?.event_types,
    chat: globalThis?.chat,
    chat_metadata: globalThis?.chat_metadata,
  };
}

function setPromptExtensionBlock(content) {
  const setExtensionPrompt = globalThis?.setExtensionPrompt;
  if (typeof setExtensionPrompt !== 'function') {
    return false;
  }

  try {
    setExtensionPrompt(EXTENSION_NAME, content, 1, 0, false);
    return true;
  } catch (error) {
    console.warn(`[${EXTENSION_NAME}] setExtensionPrompt failed`, error);
    return false;
  }
}

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
  if (isInjecting) {
    return;
  }

  isInjecting = true;
  try {
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
    lastContextBlock = contextBlock;

    const injectedAsExtensionPrompt = setPromptExtensionBlock(contextBlock);
    if (injectedAsExtensionPrompt) {
      setInjectionMode('extension-prompt');
      return;
    }

    setInjectionMode('textarea-fallback');

    if (textarea.value.includes('[WORLD STATE]')) {
      return;
    }

    textarea.value = `${contextBlock}\n\n${textarea.value}`;
  } finally {
    isInjecting = false;
  }
}

async function runTurnCompleteHook() {
  const settings = {
    ...getSettings(),
    onDebug: (endpoint, payload) => renderDebug(getSettings().debug, endpoint, payload),
  };
  if (!settings.autoTurnComplete) {
    return;
  }

  const { chat, chat_metadata } = getStRuntime();
  const sessionId = settings.sessionPrefix + (chat_metadata?.chat_id || 'default-chat');
  await ensureSessionBootstrap(settings, sessionId);
  const sceneId = `scene-${Date.now()}`;
  const chatMessages = Array.isArray(chat) ? chat : window?.context?.chat || [];
  const user = chatMessages.at(-2)?.mes || '';
  const assistant = chatMessages.at(-1)?.mes || '';

  if (!user || !assistant) {
    return;
  }

  const dedupeKey = `${sessionId}::${user.slice(0, 120)}::${assistant.slice(0, 120)}`;
  if (dedupeKey === lastCompletedTurnKey) {
    return;
  }

  await completeTurn(settings, {
    sessionId,
    sceneId,
    userMessage: user,
    assistantMessage: assistant,
  });
  lastCompletedTurnKey = dedupeKey;
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

  const settingsForTest = {
    ...getSettings(),
    onDebug: (endpoint, payload) => renderDebug(getSettings().debug, endpoint, payload),
  };
  await testBackend(settingsForTest);

  const sendButton = document.querySelector('#send_but');
  sendButton?.addEventListener('click', async () => {
    try {
      await injectContextIntoInput();
    } catch (error) {
      console.error(`[${EXTENSION_NAME}] context injection on click failed`, error);
    }
  });

  document.addEventListener('keydown', async (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      try {
        await injectContextIntoInput();
      } catch (error) {
        console.error(`[${EXTENSION_NAME}] context injection failed`, error);
      }
    }
  });

  const runtime = getStRuntime();
  if (runtime.eventSource && runtime.event_types) {
    if (runtime.event_types.GENERATION_AFTER_COMMANDS) {
      runtime.eventSource.makeFirst(runtime.event_types.GENERATION_AFTER_COMMANDS, async () => {
        if (!lastContextBlock) {
          return;
        }

        setPromptExtensionBlock(lastContextBlock);
        setInjectionMode('extension-prompt');
      });
    }

    runtime.eventSource.on(runtime.event_types.CHAT_CHANGED, async () => {
      try {
        const { chat_metadata } = getStRuntime();
        const settings = {
          ...getSettings(),
          onDebug: (endpoint, payload) => renderDebug(getSettings().debug, endpoint, payload),
        };
        const sessionId = settings.sessionPrefix + (chat_metadata?.chat_id || 'default-chat');
        lastCompletedTurnKey = '';
        lastContextBlock = '';
        setPromptExtensionBlock('');
        setInjectionMode('idle');
        await ensureSessionBootstrap(settings, sessionId);
      } catch (error) {
        console.error(`[${EXTENSION_NAME}] chat bootstrap failed`, error);
      }
    });

    runtime.eventSource.on(runtime.event_types.CHAT_CREATED, async () => {
      lastCompletedTurnKey = '';
    });

    runtime.eventSource.makeFirst(runtime.event_types.CHARACTER_MESSAGE_RENDERED, async () => {
      try {
        await runTurnCompleteHook();
      } catch (error) {
        console.error(`[${EXTENSION_NAME}] turn complete failed`, error);
      }
    });
  }

  if (!runtime.eventSource || !runtime.event_types) {
    document.addEventListener('message_sent', async () => {
      try {
        await runTurnCompleteHook();
      } catch (error) {
        console.error(`[${EXTENSION_NAME}] turn complete failed`, error);
      }
    });
  }
});
