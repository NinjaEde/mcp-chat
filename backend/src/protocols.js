// Adapter/Plugin-Architektur für Protokolle: SSE, HTTP-stream, STDIO

export class ProtocolAdapter {
  constructor(config) {
    this.config = config;
  }
  async sendRequest(input) {
    throw new Error('Not implemented');
  }
}

export class SSEAdapter extends ProtocolAdapter {
  async sendRequest(input) {
    // Beispiel: fetch mit EventSource
    // return new EventSource(this.config.url);
    return { type: 'sse', url: this.config.url, input };
  }
}

export class HTTPStreamAdapter extends ProtocolAdapter {
  async sendRequest(input) {
    // Beispiel: fetch mit ReadableStream
    // return fetch(this.config.url, { method: 'POST', body: JSON.stringify(input) });
    return { type: 'http-stream', url: this.config.url, input };
  }
}

export class STDIOAdapter extends ProtocolAdapter {
  async sendRequest(input) {
    // Beispiel: Child Process
    // return spawn(this.config.cmd, [input]);
    return { type: 'stdio', cmd: this.config.cmd, input };
  }
}
