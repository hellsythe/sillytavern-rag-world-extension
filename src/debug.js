let debugElements = {
  mode: null,
  endpoint: null,
  status: null,
  latency: null,
  request: null,
  response: null,
};

export function mountDebugPanel(host, onTestBackend) {
  const panel = document.createElement('div');
  panel.className = 'extension_block';
  panel.style.marginTop = '8px';
  panel.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header"><b>RAG Bridge Debug</b></div>
      <div class="inline-drawer-content">
        <div><b>Prompt injection mode:</b> <span id="ragws_debug_mode">-</span></div>
        <div><b>Endpoint:</b> <span id="ragws_debug_endpoint">-</span></div>
        <div><b>Status:</b> <span id="ragws_debug_status">-</span></div>
        <div><b>Latency:</b> <span id="ragws_debug_latency">-</span></div>
        <div style="margin: 8px 0;">
          <button id="ragws_debug_test" class="menu_button" type="button">Test Backend</button>
        </div>
        <label>Last Request</label>
        <textarea id="ragws_debug_request" class="text_pole" rows="4" readonly></textarea>
        <label>Last Response</label>
        <textarea id="ragws_debug_response" class="text_pole" rows="6" readonly></textarea>
      </div>
    </div>
  `;
  host.prepend(panel);

  debugElements = {
    mode: panel.querySelector('#ragws_debug_mode'),
    endpoint: panel.querySelector('#ragws_debug_endpoint'),
    status: panel.querySelector('#ragws_debug_status'),
    latency: panel.querySelector('#ragws_debug_latency'),
    request: panel.querySelector('#ragws_debug_request'),
    response: panel.querySelector('#ragws_debug_response'),
  };

  const testButton = panel.querySelector('#ragws_debug_test');
  if (testButton && onTestBackend) {
    testButton.addEventListener('click', async () => {
      testButton.disabled = true;
      try {
        await onTestBackend();
      } finally {
        testButton.disabled = false;
      }
    });
  }
}

export function setInjectionMode(mode) {
  if (!debugElements.mode) {
    return;
  }

  debugElements.mode.textContent = mode;
}

export function renderDebug(enabled, endpoint, payload) {
  if (!enabled || !debugElements.endpoint) {
    return;
  }

  debugElements.endpoint.textContent = endpoint;
  debugElements.status.textContent = payload.ok ? `${payload.status} OK` : `${payload.status} ERROR`;
  debugElements.latency.textContent = `${payload.latencyMs} ms`;
  debugElements.request.value = JSON.stringify(payload.request || {}, null, 2);
  debugElements.response.value = JSON.stringify(payload.response || payload.error || {}, null, 2);
}
