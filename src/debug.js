let debugElements = {
  endpoint: null,
  status: null,
  latency: null,
  request: null,
  response: null,
};

export function mountDebugPanel(host) {
  const panel = document.createElement('div');
  panel.className = 'extension_block';
  panel.style.marginTop = '8px';
  panel.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header"><b>RAG Bridge Debug</b></div>
      <div class="inline-drawer-content">
        <div><b>Endpoint:</b> <span id="ragws_debug_endpoint">-</span></div>
        <div><b>Status:</b> <span id="ragws_debug_status">-</span></div>
        <div><b>Latency:</b> <span id="ragws_debug_latency">-</span></div>
        <label>Last Request</label>
        <textarea id="ragws_debug_request" class="text_pole" rows="4" readonly></textarea>
        <label>Last Response</label>
        <textarea id="ragws_debug_response" class="text_pole" rows="6" readonly></textarea>
      </div>
    </div>
  `;
  host.prepend(panel);

  debugElements = {
    endpoint: panel.querySelector('#ragws_debug_endpoint'),
    status: panel.querySelector('#ragws_debug_status'),
    latency: panel.querySelector('#ragws_debug_latency'),
    request: panel.querySelector('#ragws_debug_request'),
    response: panel.querySelector('#ragws_debug_response'),
  };
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
