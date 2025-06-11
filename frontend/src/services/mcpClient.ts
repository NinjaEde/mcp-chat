export interface MCPServer {
  id: string;
  name: string;
  command: string[];
  args?: string[];
  env?: Record<string, string>;
  protocol: 'stdio' | 'sse' | 'http-stream';
  endpoint?: string; // For SSE/HTTP-stream protocols
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  capabilities?: MCPCapabilities;
  tools?: MCPTool[];
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
  error?: string;
  lastConnected?: string;
  reconnectAttempts?: number;
}

export interface MCPCapabilities {
  tools?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  sampling?: boolean;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
}

interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: any;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

interface MCPConnection {
  connect(...args: any[]): Promise<void>;
  send(message: MCPMessage): Promise<void>;
  close(): Promise<void>;
  onMessage(callback: (message: MCPMessage) => void): void;
  onError(callback: (error: Error) => void): void;
  onClose(callback: () => void): void;
}

class STDIOConnection implements MCPConnection {
  private process: any = null;
  private messageId = 0;
  private pendingRequests = new Map<string | number, { resolve: Function; reject: Function }>();
  private messageCallbacks = new Set<(message: MCPMessage) => void>();
  private errorCallbacks = new Set<(error: Error) => void>();
  private closeCallbacks = new Set<() => void>();

  private serverId: string;
  constructor(serverId: string) {
    this.serverId = serverId;
  }

  async connect(command: string[], args?: string[], env?: Record<string, string>): Promise<void> {
    try {
      const response = await fetch('/api/mcp/stdio/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          serverId: this.serverId,
          command, 
          args: args || [], 
          env: env || {} 
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to spawn process: ${response.statusText}`);
      }

      const result = await response.json();
      this.process = { pid: result.pid };

      // Start listening for messages via SSE
      this.startMessageListener();
    } catch (error) {
      throw new Error(`STDIO connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private startMessageListener(): void {
    const eventSource = new EventSource(`/api/mcp/stdio/${this.serverId}/messages`);
    
    eventSource.onmessage = (event) => {
      try {
        const message: MCPMessage = JSON.parse(event.data);
        
        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);
          
          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result);
          }
        } else {
          // Notification or request from server
          this.messageCallbacks.forEach(callback => callback(message));
        }
      } catch (error) {
        this.errorCallbacks.forEach(callback => 
          callback(new Error(`Failed to parse message: ${error}`))
        );
      }
    };

    eventSource.onerror = () => {
      this.errorCallbacks.forEach(callback => 
        callback(new Error('STDIO message stream error'))
      );
    };

    eventSource.addEventListener('close', () => {
      this.closeCallbacks.forEach(callback => callback());
    });
  }

  async send(message: MCPMessage): Promise<void> {
    if (!this.process) {
      throw new Error('STDIO connection not established');
    }

    const response = await fetch(`/api/mcp/stdio/${this.serverId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    const id = ++this.messageId;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      this.send(message).catch(reject);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout for method: ${method}`));
        }
      }, 30000);
    });
  }

  async close(): Promise<void> {
    if (this.process) {
      try {
        await fetch(`/api/mcp/stdio/${this.serverId}/close`, { method: 'POST' });
      } catch (error) {
        console.error('Error closing STDIO connection:', error);
      }
      this.process = null;
    }
  }

  onMessage(callback: (message: MCPMessage) => void): void {
    this.messageCallbacks.add(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.add(callback);
  }

  onClose(callback: () => void): void {
    this.closeCallbacks.add(callback);
  }
}

class SSEConnection implements MCPConnection {
  private eventSource: EventSource | null = null;
  private messageId = 0;
  private pendingRequests = new Map<string | number, { resolve: Function; reject: Function }>();
  private messageCallbacks = new Set<(message: MCPMessage) => void>();
  private errorCallbacks = new Set<(error: Error) => void>();
  private closeCallbacks = new Set<() => void>();

  private endpoint: string;
  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.eventSource = new EventSource(this.endpoint);
      
      this.eventSource.onopen = () => resolve();
      
      this.eventSource.onmessage = (event) => {
        try {
          const message: MCPMessage = JSON.parse(event.data);
          
          if (message.id && this.pendingRequests.has(message.id)) {
            const { resolve, reject } = this.pendingRequests.get(message.id)!;
            this.pendingRequests.delete(message.id);
            
            if (message.error) {
              reject(new Error(message.error.message));
            } else {
              resolve(message.result);
            }
          } else {
            this.messageCallbacks.forEach(callback => callback(message));
          }
        } catch (error) {
          this.errorCallbacks.forEach(callback => 
            callback(new Error(`Failed to parse SSE message: ${error}`))
          );
        }
      };

      this.eventSource.onerror = (error) => {
        reject(new Error('SSE connection failed'));
        this.errorCallbacks.forEach(callback => 
          callback(new Error('SSE connection error'))
        );
      };
    });
  }

  async send(message: MCPMessage): Promise<void> {
    const response = await fetch(this.endpoint.replace('/events', '/send'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Failed to send SSE message: ${response.statusText}`);
    }
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    const id = ++this.messageId;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      this.send(message).catch(reject);
      
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`SSE request timeout for method: ${method}`));
        }
      }, 30000);
    });
  }

  async close(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  onMessage(callback: (message: MCPMessage) => void): void {
    this.messageCallbacks.add(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.add(callback);
  }

  onClose(callback: () => void): void {
    this.closeCallbacks.add(callback);
  }
}

class HTTPStreamConnection implements MCPConnection {
  private messageId = 0;
  private pendingRequests = new Map<string | number, { resolve: Function; reject: Function }>();
  private messageCallbacks = new Set<(message: MCPMessage) => void>();
  private errorCallbacks = new Set<(error: Error) => void>();
  private closeCallbacks = new Set<() => void>();

  private endpoint: string;
  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async connect(): Promise<void> {
    // HTTP stream connections are established per request
    const response = await fetch(`${this.endpoint}/connect`, { method: 'POST' });
    if (!response.ok) {
      throw new Error(`HTTP stream connection failed: ${response.statusText}`);
    }
  }

  async send(message: MCPMessage): Promise<void> {
    const response = await fetch(`${this.endpoint}/message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`Failed to send HTTP stream message: ${response.statusText}`);
    }
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    const id = ++this.messageId;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const response = await fetch(`${this.endpoint}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.result;
  }

  async close(): Promise<void> {
    try {
      await fetch(`${this.endpoint}/disconnect`, { method: 'POST' });
    } catch (error) {
      console.error('Error closing HTTP stream connection:', error);
    }
  }

  onMessage(callback: (message: MCPMessage) => void): void {
    this.messageCallbacks.add(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.add(callback);
  }

  onClose(callback: () => void): void {
    this.closeCallbacks.add(callback);
  }
}

class MCPClientService {
  private servers = new Map<string, MCPServer>();
  private connections = new Map<string, MCPConnection>();
  private listeners = new Set<(servers: MCPServer[]) => void>();
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  
  // API base URL configuration
  private getApiBaseUrl(): string {
    // In development, use the proxy or fallback to backend port
    if (import.meta.env.DEV) {
      // First try the proxy, if that fails, use direct backend URL
      return '';  // Empty string uses the proxy via relative URLs
    }
    // In production, use the same origin or configured backend URL
    return import.meta.env.VITE_API_BASE_URL || '';
  }
  
  private async apiRequest(endpoint: string, options: RequestInit = {}): Promise<Response> {
    const baseUrl = this.getApiBaseUrl();
    const url = `${baseUrl}${endpoint}`;
    
    const token = localStorage.getItem('token');
    const defaultHeaders: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
    
    const requestOptions: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers
      }
    };
    
    console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);
    
    try {
      const response = await fetch(url, requestOptions);
      console.log(`📡 API Response: ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      console.error(`❌ API Request failed: ${error}`);
      
      // If proxy fails in development, try direct backend URL
      if (import.meta.env.DEV && baseUrl === '') {
        console.log('🔄 Retrying with direct backend URL...');
        const directUrl = `http://localhost:3001${endpoint}`;
        console.log(`🌐 Direct API Request: ${options.method || 'GET'} ${directUrl}`);
        return await fetch(directUrl, requestOptions);
      }
      
      throw error;
    }
  }

  async loadSavedServers(): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        console.warn('No token found, cannot load servers');
        return;
      }

      const response = await this.apiRequest('/api/mcp/servers');
      
      if (!response.ok) {
        if (response.status === 404) {
          console.warn('MCP servers endpoint not found, starting with empty servers');
          return;
        }
        if (response.status === 401) {
          console.warn('Unauthorized access to MCP servers');
          return;
        }
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const responseText = await response.text();
        console.error('Expected JSON but received:', contentType, responseText.substring(0, 200));
        throw new Error('Server returned non-JSON response');
      }
      
      const data = await response.json();
      const savedServers = data.servers || [];
      
      // Transform backend server format to frontend MCPServer format
      savedServers.forEach((backendServer: any) => {
        const mcpServer: MCPServer = {
          id: backendServer.id.toString(),
          name: backendServer.name,
          protocol: backendServer.config.protocol || backendServer.type,
          status: 'disconnected',
          command: backendServer.config.command || [],
          args: backendServer.config.args || [],
          env: backendServer.config.env || {},
          endpoint: backendServer.config.endpoint
        };
        
        this.servers.set(mcpServer.id, mcpServer);
      });
      
      this.notifyListeners();
    } catch (error) {
      console.error('Error loading saved servers:', error);
    }
  }

  async saveServer(server: Omit<MCPServer, 'status' | 'capabilities' | 'tools' | 'resources' | 'prompts' | 'reconnectAttempts'>): Promise<void> {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }

      // Transform MCPServer format to backend format
      const backendServerData = {
        name: server.name,
        type: server.protocol, // Map protocol to type
        config: {
          protocol: server.protocol,
          // Only include command/args/env for STDIO servers
          ...(server.protocol === 'stdio' && server.command && server.command.length > 0 && { command: server.command }),
          ...(server.protocol === 'stdio' && server.args && server.args.length > 0 && { args: server.args }),
          ...(server.protocol === 'stdio' && server.env && Object.keys(server.env).length > 0 && { env: server.env }),
          // Include endpoint for SSE and HTTP-stream servers
          ...((server.protocol === 'sse' || server.protocol === 'http-stream') && server.endpoint && { endpoint: server.endpoint })
        }
      };

      console.log('🔧 Sending server data to backend:', JSON.stringify(backendServerData, null, 2));

      const response = await this.apiRequest('/api/mcp/servers', {
        method: 'POST',
        body: JSON.stringify(backendServerData)
      });
      
      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        let fullErrorDetails = '';
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            console.error('❌ Backend error response:', errorData);
            errorMessage = errorData.error || errorMessage;
            fullErrorDetails = JSON.stringify(errorData, null, 2);
          } catch (e) {
            console.error('❌ Failed to parse JSON error response:', e);
          }
        } else {
          const errorText = await response.text();
          console.error('❌ Non-JSON error response:', errorText);
          fullErrorDetails = errorText;
          if (errorText.includes('<!DOCTYPE')) {
            errorMessage = 'Server returned HTML instead of JSON - endpoint may not exist';
          } else {
            errorMessage = `${errorMessage}: ${errorText.substring(0, 200)}`;
          }
        }
        
        console.error('❌ Full error details:', fullErrorDetails);
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      console.log('✅ Server created successfully:', data);
      
      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }
      
      // Add the server to local state
      const mcpServer: MCPServer = {
        ...server,
        id: data.server.id.toString(),
        status: 'disconnected'
      };
      
      this.servers.set(mcpServer.id, mcpServer);
      this.notifyListeners();
      
    } catch (error) {
      console.error('Error saving server:', error);
      throw error;
    }
  }

  async connectToServer(serverConfig: Omit<MCPServer, 'status' | 'capabilities' | 'tools' | 'resources' | 'prompts' | 'reconnectAttempts'>): Promise<void> {
    const server: MCPServer = {
      ...serverConfig,
      status: 'connecting',
      reconnectAttempts: 0
    };
    
    this.servers.set(server.id, server);
    this.notifyListeners();

    try {
      const response = await this.apiRequest(`/api/mcp/servers/${server.id}/connect`, {
        method: 'POST'
      });
      
      if (response.ok) {
        const data = await response.json();
        server.status = data.connected ? 'connected' : 'error';
        server.capabilities = data.capabilities;
        
        if (data.connected) {
          server.lastConnected = new Date().toISOString();
          server.reconnectAttempts = 0;
          
          // Extract tools from capabilities
          if (data.capabilities && data.capabilities.tools) {
            server.tools = Array.isArray(data.capabilities.tools) 
              ? data.capabilities.tools 
              : [];
          }
        }
      } else {
        server.status = 'error';
        server.error = 'Connection test failed';
      }
    } catch (error) {
      server.status = 'error';
      server.error = error instanceof Error ? error.message : 'Unknown error';
    }
    
    this.servers.set(server.id, server);
    this.notifyListeners();
  }

  private async initializeMCPConnection(serverId: string, connection: MCPConnection): Promise<void> {
    // Send initialize request
    const initializeResult = await (connection as any).sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      clientInfo: {
        name: 'mcp-chat-client',
        version: '1.0.0'
      }
    });

    const server = this.servers.get(serverId);
    if (server) {
      server.capabilities = initializeResult.capabilities;
      this.servers.set(serverId, server);
    }

    // Send initialized notification
    await connection.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });
  }

  private async fetchServerCapabilities(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    const server = this.servers.get(serverId);
    
    if (!connection || !server) return;

    try {
      // Fetch tools
      if (server.capabilities?.tools) {
        const toolsResult = await (connection as any).sendRequest('tools/list');
        server.tools = toolsResult.tools || [];
      }

      // Fetch resources
      if (server.capabilities?.resources) {
        const resourcesResult = await (connection as any).sendRequest('resources/list');
        server.resources = resourcesResult.resources || [];
      }

      // Fetch prompts
      if (server.capabilities?.prompts) {
        const promptsResult = await (connection as any).sendRequest('prompts/list');
        server.prompts = promptsResult.prompts || [];
      }

      this.servers.set(serverId, server);
      this.notifyListeners();
      
      console.log(`Fetched capabilities for ${server.name}:`, {
        tools: server.tools?.length || 0,
        resources: server.resources?.length || 0,
        prompts: server.prompts?.length || 0
      });
      
    } catch (error) {
      console.error(`Error fetching capabilities for ${server.name}:`, error);
    }
  }

  private async handleConnectionError(serverId: string, error: Error): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) return;

    server.status = 'error';
    server.error = error.message;
    
    if (server.reconnectAttempts! < this.MAX_RECONNECT_ATTEMPTS) {
      server.reconnectAttempts = (server.reconnectAttempts || 0) + 1;
      console.log(`Attempting to reconnect ${server.name} (attempt ${server.reconnectAttempts})`);
      
      // Wait before reconnecting (exponential backoff)
      setTimeout(() => {
        this.connectToServer(server);
      }, Math.pow(2, server.reconnectAttempts!) * 1000);
    }

    this.servers.set(serverId, server);
    this.notifyListeners();
  }

  private handleConnectionClose(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.status = 'disconnected';
      this.servers.set(serverId, server);
      this.notifyListeners();
    }
    
    this.connections.delete(serverId);
  }

  async disconnectServer(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    const server = this.servers.get(serverId);
    
    if (connection) {
      try {
        await connection.close();
      } catch (error) {
        console.error('Error disconnecting MCP server:', error);
      }
      this.connections.delete(serverId);
    }

    if (server) {
      server.status = 'disconnected';
      server.error = undefined;
      server.reconnectAttempts = 0;
      this.servers.set(serverId, server);
      this.notifyListeners();
    }
  }

  async deleteServer(serverId: string): Promise<void> {
    try {
      await this.disconnectServer(serverId);
      
      const response = await this.apiRequest(`/api/mcp/servers/${serverId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
      
      this.servers.delete(serverId);
      this.notifyListeners();
    } catch (error) {
      console.error('Error deleting server:', error);
      throw error;
    }
  }

  async callTool(serverId: string, toolName: string, toolArgs: Record<string, any>): Promise<any> {
    try {
      const response = await this.apiRequest(`/api/mcp/servers/${serverId}/tools/${toolName}/call`, {
        method: 'POST',
        body: JSON.stringify({ arguments: toolArgs })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Tool call failed');
      }
      
      return data.result;
    } catch (error) {
      throw new Error(`Tool call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refreshTools(serverId: string): Promise<void> {
    try {
      const response = await this.apiRequest(`/api/mcp/servers/${serverId}/tools`);
      
      if (response.ok) {
        const data = await response.json();
        const server = this.servers.get(serverId);
        if (server) {
          server.tools = data.tools || [];
          this.servers.set(serverId, server);
          this.notifyListeners();
        }
      }
    } catch (error) {
      console.error('Error refreshing tools:', error);
    }
  }

  async getResource(serverId: string, uri: string): Promise<any> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`No active connection for server: ${serverId}`);
    }

    const result = await (connection as any).sendRequest('resources/read', { uri });
    return result;
  }

  async getPrompt(serverId: string, name: string, promptArgs?: Record<string, any>): Promise<any> {
    const connection = this.connections.get(serverId);
    if (!connection) {
      throw new Error(`No active connection for server: ${serverId}`);
    }

    const result = await (connection as any).sendRequest('prompts/get', { 
      name, 
      arguments: promptArgs || {} 
    });
    return result;
  }

  getServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  getServer(serverId: string): MCPServer | undefined {
    return this.servers.get(serverId);
  }

  subscribe(callback: (servers: MCPServer[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(): void {
    const servers = this.getServers();
    this.listeners.forEach(callback => callback(servers));
  }
}

export const mcpClient = new MCPClientService();

