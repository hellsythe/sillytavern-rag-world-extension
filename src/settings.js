const defaultSettings = {
  backendUrl: 'http://localhost:3000',
  topK: 5,
  autoTurnComplete: true,
  autoBootstrap: true,
  worldId: '',
  sessionPrefix: 'st-',
  debug: false,
};

let extensionName = '';

export function initSettings(name) {
  extensionName = name;
  const saved = JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
  const settings = { ...defaultSettings, ...saved };
  localStorage.setItem(getStorageKey(), JSON.stringify(settings));
  renderSettings(settings);
}

export function getSettingsHost() {
  return document.querySelector('#extensions_settings') || document.body;
}

export function getSettings() {
  const saved = JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
  return { ...defaultSettings, ...saved };
}

function getStorageKey() {
  return `extension_settings:${extensionName}`;
}

function saveSettings(next) {
  localStorage.setItem(getStorageKey(), JSON.stringify(next));
}

function renderSettings(settings) {
  const host = getSettingsHost();
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

        <label>World ID</label>
        <input id="ragws_world_id" class="text_pole" type="text" value="${settings.worldId}" placeholder="world uuid" />

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
  bind('ragws_auto_turn', (e) => saveSettings({ ...getSettings(), autoTurnComplete: e.target.checked }));
  bind('ragws_auto_bootstrap', (e) => saveSettings({ ...getSettings(), autoBootstrap: e.target.checked }));
  bind('ragws_debug', (e) => saveSettings({ ...getSettings(), debug: e.target.checked }));
}
