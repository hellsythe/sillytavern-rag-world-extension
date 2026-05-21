const defaultSettings = {
  backendUrl: 'http://localhost:3000/api/v1',
  topK: 5,
  autoTurnComplete: true,
  autoBootstrap: true,
  worldId: '',
  sessionPrefix: 'st-',
  debug: false,
};

const MODULE_NAME = 'rag-worldstate-bridge';

function getContext() {
  return globalThis.SillyTavern?.getContext?.() || null;
}

export function initSettings() {
  const context = getContext();
  if (!context) {
    return;
  }

  if (!context.extensionSettings[MODULE_NAME]) {
    context.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
  }

  for (const key of Object.keys(defaultSettings)) {
    if (!Object.hasOwn(context.extensionSettings[MODULE_NAME], key)) {
      context.extensionSettings[MODULE_NAME][key] = defaultSettings[key];
    }
  }
}

export function getSettings() {
  initSettings();
  const context = getContext();
  if (!context) {
    return structuredClone(defaultSettings);
  }
  return context.extensionSettings[MODULE_NAME];
}

export function getSettingsHost() {
  return document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings') || document.body;
}

export function getCurrentChatId() {
  const context = getContext();
  return globalThis?.chat_metadata?.chat_id || context?.chatId || 'default-chat';
}

export function getWorldIdForChat(settings) {
  const context = getContext();
  const chatMetadata = context?.chatMetadata || {};
  return chatMetadata.ragWorldId || settings.worldId || '';
}

function saveSettings(next) {
  const context = getContext();
  if (!context) {
    return;
  }
  context.extensionSettings[MODULE_NAME] = next;
  context.saveSettingsDebounced();
}

async function saveChatWorldId(value) {
  const context = getContext();
  if (!context) {
    return;
  }
  context.chatMetadata.ragWorldId = value || '';
  await context.saveMetadata();
}

export function renderSettings() {
  const settings = getSettings();
  const host = getSettingsHost();
  const chatId = getCurrentChatId();
  const chatWorldId = getWorldIdForChat(settings);
  const container = document.createElement('div');
  container.className = 'extension_block';
  container.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>RAG + World State Bridge</b>
      </div>
      <div class="inline-drawer-content">
        <label>Backend URL</label>
        <input id="ragws_backend_url" class="text_pole" type="text" value="${settings.backendUrl}" />

        <label>Top K</label>
        <input id="ragws_top_k" class="text_pole" type="number" min="1" max="20" value="${settings.topK}" />

        <label>Session Prefix</label>
        <input id="ragws_session_prefix" class="text_pole" type="text" value="${settings.sessionPrefix}" />

        <label>World ID (Global)</label>
        <input id="ragws_world_id" class="text_pole" type="text" value="${settings.worldId}" placeholder="world uuid" />

        <label>Current Chat ID</label>
        <input id="ragws_chat_id" class="text_pole" type="text" value="${chatId}" readonly />

        <label>World ID (Current Chat)</label>
        <input id="ragws_chat_world_id" class="text_pole" type="text" value="${chatWorldId}" placeholder="override for this chat" />
        <small>Saved in chat metadata. Leave empty to use global value.</small>

        <label><input id="ragws_auto_turn" type="checkbox" ${settings.autoTurnComplete ? 'checked' : ''}/> Auto turn complete</label>
        <label><input id="ragws_auto_bootstrap" type="checkbox" ${settings.autoBootstrap ? 'checked' : ''}/> Auto bootstrap session</label>
        <label><input id="ragws_debug" type="checkbox" ${settings.debug ? 'checked' : ''}/> Debug logs</label>
      </div>
    </div>
  `;

  host.prepend(container);

  const bind = (id, cb) => container.querySelector(`#${id}`)?.addEventListener('change', cb);
  bind('ragws_backend_url', (e) => saveSettings({ ...getSettings(), backendUrl: e.target.value.trim() }));
  bind('ragws_top_k', (e) => saveSettings({ ...getSettings(), topK: Number(e.target.value || 5) }));
  bind('ragws_session_prefix', (e) => saveSettings({ ...getSettings(), sessionPrefix: e.target.value || 'st-' }));
  bind('ragws_world_id', (e) => saveSettings({ ...getSettings(), worldId: e.target.value.trim() }));
  bind('ragws_chat_world_id', async (e) => {
    await saveChatWorldId(e.target.value.trim());
  });
  bind('ragws_auto_turn', (e) => saveSettings({ ...getSettings(), autoTurnComplete: e.target.checked }));
  bind('ragws_auto_bootstrap', (e) => saveSettings({ ...getSettings(), autoBootstrap: e.target.checked }));
  bind('ragws_debug', (e) => saveSettings({ ...getSettings(), debug: e.target.checked }));
}
