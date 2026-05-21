async function callJson(url, init) {
  const startedAt = Date.now();
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    const error = new Error(`${response.status} ${text}`);
    error.debugMeta = {
      url,
      method: init?.method || 'GET',
      status: response.status,
      latencyMs: Date.now() - startedAt,
      ok: false,
    };
    throw error;
  }
  const data = await response.json();
  return {
    data,
    debugMeta: {
      url,
      method: init?.method || 'GET',
      status: response.status,
      latencyMs: Date.now() - startedAt,
      ok: true,
    },
  };
}

export async function fetchRagContext(settings, sessionId, prompt) {
  const result = await callJson(`${settings.backendUrl}/sillytavern/rag/retrieve`, {
    method: 'POST',
    body: JSON.stringify({
      sessionId,
      prompt,
      topK: settings.topK,
    }),
  });
  settings.onDebug?.('rag/retrieve', {
    request: { sessionId, prompt, topK: settings.topK },
    response: result.data,
    ...result.debugMeta,
  });
  return result.data;
}

export async function fetchWorldState(settings, sessionId) {
  try {
    const result = await callJson(
      `${settings.backendUrl}/sillytavern/world-state/${encodeURIComponent(sessionId)}`,
      {
        method: 'GET',
      },
    );
    settings.onDebug?.('world-state/get', {
      request: { sessionId },
      response: result.data,
      ...result.debugMeta,
    });
    return result.data;
  } catch (error) {
    settings.onDebug?.('world-state/get', {
      request: { sessionId },
      response: null,
      url: `${settings.backendUrl}/sillytavern/world-state/${encodeURIComponent(sessionId)}`,
      method: 'GET',
      status: error?.debugMeta?.status || 500,
      latencyMs: error?.debugMeta?.latencyMs || 0,
      ok: false,
      error: String(error?.message || error),
    });
    return null;
  }
}

export async function completeTurn(settings, payload) {
  const result = await callJson(`${settings.backendUrl}/sillytavern/turn/complete`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  settings.onDebug?.('turn/complete', {
    request: payload,
    response: result.data,
    ...result.debugMeta,
  });
  return result.data;
}

export async function bootstrapSession(settings, sessionId, worldId, forceReingest = false) {
  const result = await callJson(
    `${settings.backendUrl}/sillytavern/sessions/${encodeURIComponent(sessionId)}/bootstrap/${encodeURIComponent(worldId)}`,
    {
      method: 'POST',
      body: JSON.stringify({ forceReingest }),
    },
  );
  settings.onDebug?.('session/bootstrap', {
    request: { sessionId, worldId, forceReingest },
    response: result.data,
    ...result.debugMeta,
  });
  return result.data;
}
