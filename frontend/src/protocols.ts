// Adapter/Plugin-Architektur für Protokolle: SSE, HTTP-stream, STDIO (Frontend)

export class ProtocolAdapter {
  config: any;
  constructor(config: any) {
    this.config = config;
  }
  async sendRequest(input: any): Promise<any> {
    throw new Error('Not implemented');
  }
}

export class SSEAdapter extends ProtocolAdapter {
  async sendRequest(input: any): Promise<any> {
    // Beispiel: fetch mit EventSource
    // return new EventSource(this.config.url);
    return { type: 'sse', url: this.config.url, input };
  }
}

export class HTTPStreamAdapter extends ProtocolAdapter {
  async sendRequest(input: any): Promise<any> {
    // Beispiel: fetch mit ReadableStream
    // return fetch(this.config.url, { method: 'POST', body: JSON.stringify(input) });
    return { type: 'http-stream', url: this.config.url, input };
  }
}

export class STDIOAdapter extends ProtocolAdapter {
  async sendRequest(input: any): Promise<any> {
    // Im Frontend nicht nutzbar, nur als Platzhalter
    return { type: 'stdio', cmd: this.config.cmd, input };
  }
}
