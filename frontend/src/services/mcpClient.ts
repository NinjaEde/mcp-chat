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
      
      console.log('📡 Loaded servers from backend:', savedServers.length);
      
      // Clear existing servers and rebuild from backend data
      this.servers.clear();
      
      // Transform backend server format to frontend MCPServer format
      savedServers.forEach((backendServer: any) => {
        const mcpServer: MCPServer = {
          id: backendServer.id.toString(), // Ensure ID is string
          name: backendServer.name,
          protocol: backendServer.config.protocol || backendServer.type,
          status: backendServer.status || 'disconnected',
          command: backendServer.config.command || [],
          args: backendServer.config.args || [],
          env: backendServer.config.env || {},
          endpoint: backendServer.config.endpoint,
          capabilities: backendServer.capabilities ? 
            (typeof backendServer.capabilities === 'string' ? 
              JSON.parse(backendServer.capabilities) : 
              backendServer.capabilities) : 
            undefined,
          lastConnected: backendServer.last_connected,
          tools: [] // Will be populated by fetchServerCapabilities if connected
        };
        
        console.log(`📋 Loaded server: ${mcpServer.name} (ID: ${mcpServer.id}, Status: ${mcpServer.status})`);
        this.servers.set(mcpServer.id, mcpServer);
      });
      
      this.notifyListeners();
      console.log('✅ Server loading completed, total servers:', this.servers.size);
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
      console.log(`🔌 Starting connection to ${server.name} via ${server.protocol}`);
      
      // First, try to connect via backend API (this is the working approach)
      const response = await this.apiRequest(`/api/mcp/servers/${server.id}/connect`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`Backend connection failed: ${response.statusText}`);
      }
      
      const connectionResult = await response.json();
      console.log(`✅ Backend connection result for ${server.name}:`, connectionResult);
      
      if (!connectionResult.connected) {
        throw new Error('Server connection failed on backend');
      }
      
      // Update server with backend results
      server.status = 'connected';
      server.lastConnected = new Date().toISOString();
      server.reconnectAttempts = 0;
      server.capabilities = connectionResult.capabilities || {};
      
      // Try to establish frontend MCP connection as secondary step (optional)
      try {
        console.log(`🔄 Attempting direct MCP connection to ${server.name}`);
        await this.establishDirectMCPConnection(server);
      } catch (directError) {
        console.warn(`⚠️ Direct MCP connection failed for ${server.name}, using backend API only:`, directError.message);
        // Don't fail the whole connection - backend API works
      }
      
    } catch (error) {
      console.error(`❌ Connection failed for ${server.name}:`, error);
      server.status = 'error';
      server.error = error instanceof Error ? error.message : 'Unknown error';
      
      // Clean up any partial connections
      this.connections.delete(server.id);
    }
    
    this.servers.set(server.id, server);
    this.notifyListeners();
  }

  private async establishDirectMCPConnection(server: MCPServer): Promise<void> {
    // Only try direct connections for supported protocols
    if (server.protocol === 'sse' && server.endpoint) {
      console.log(`🔗 Establishing direct SSE connection to ${server.endpoint}`);
      
      // Create connection
      const connection = new SSEConnection(server.endpoint);
      
      // Set up error handling BEFORE attempting connection
      connection.onError((error) => {
        console.warn(`⚠️ Direct SSE connection error for ${server.name}:`, error.message);
        // Don't update server status to error - backend connection still works
      });
      
      connection.onClose(() => {
        console.log(`📤 Direct SSE connection closed for ${server.name}`);
        this.connections.delete(server.id);
      });
      
      try {
        // Try to connect with timeout
        await Promise.race([
          connection.connect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 10000)
          )
        ]);
        
        console.log(`✅ Direct SSE connection established for ${server.name}`);
        
        // Store connection for direct communication
        this.connections.set(server.id, connection);
        
        // Try to initialize MCP protocol
        try {
          await this.initializeMCPConnection(server.id, connection);
          await this.fetchServerCapabilities(server.id);
          console.log(`🎉 Full MCP protocol initialized for ${server.name}`);
        } catch (mcpError) {
          console.warn(`⚠️ MCP protocol initialization failed for ${server.name}:`, mcpError.message);
          // Keep the connection but mark initialization as failed
        }
        
      } catch (connectionError) {
        console.warn(`⚠️ Direct connection failed for ${server.name}:`, connectionError.message);
        throw connectionError;
      }
    } else if (server.protocol === 'stdio') {
      console.log(`🔗 STDIO connections require backend process management for ${server.name}`);
      // STDIO connections are handled by backend - no direct frontend connection possible
    } else {
      console.log(`🔗 Protocol ${server.protocol} not supported for direct connections`);
    }
  }

  private async initializeMCPConnection(serverId: string, connection: MCPConnection): Promise<void> {
    console.log(`🔌 Initializing MCP connection for server: ${serverId}`);
    
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
      console.log(`✅ MCP initialized for ${server.name}:`, initializeResult.capabilities);
    }

    // Send initialized notification
    await connection.send({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });
    
    console.log(`🎉 MCP connection fully initialized for server: ${serverId}`);
  }

  private async fetchServerCapabilities(serverId: string): Promise<void> {
    const connection = this.connections.get(serverId);
    const server = this.servers.get(serverId);
    
    if (!connection || !server) {
      console.warn(`Cannot fetch capabilities: missing connection or server for ${serverId}`);
      return;
    }

    try {
      console.log(`🔍 Fetching capabilities for ${server.name}...`);
      
      // Fetch tools
      if (server.capabilities?.tools) {
        try {
          const toolsResult = await (connection as any).sendRequest('tools/list');
          server.tools = toolsResult.tools || [];
          console.log(`📋 Found ${server.tools.length} tools for ${server.name}`);
        } catch (error) {
          console.warn(`Failed to fetch tools for ${server.name}:`, error);
          server.tools = [];
        }
      }

      // Fetch resources
      if (server.capabilities?.resources) {
        try {
          const resourcesResult = await (connection as any).sendRequest('resources/list');
          server.resources = resourcesResult.resources || [];
          console.log(`📁 Found ${server.resources.length} resources for ${server.name}`);
        } catch (error) {
          console.warn(`Failed to fetch resources for ${server.name}:`, error);
          server.resources = [];
        }
      }

      // Fetch prompts
      if (server.capabilities?.prompts) {
        try {
          const promptsResult = await (connection as any).sendRequest('prompts/list');
          server.prompts = promptsResult.prompts || [];
          console.log(`💬 Found ${server.prompts.length} prompts for ${server.name}`);
        } catch (error) {
          console.warn(`Failed to fetch prompts for ${server.name}:`, error);
          server.prompts = [];
        }
      }

      this.servers.set(serverId, server);
      this.notifyListeners();
      
      console.log(`✅ Capabilities fetched for ${server.name}:`, {
        tools: server.tools?.length || 0,
        resources: server.resources?.length || 0,
        prompts: server.prompts?.length || 0
      });
      
    } catch (error) {
      console.error(`❌ Error fetching capabilities for ${server.name}:`, error);
      server.error = `Failed to fetch capabilities: ${error instanceof Error ? error.message : 'Unknown error'}`;
      this.servers.set(serverId, server);
      this.notifyListeners();
    }
  }

  private async handleConnectionError(serverId: string, error: Error): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) return;

    console.error(`🔥 Connection error for ${server.name}:`, error);
    server.status = 'error';
    server.error = error.message;
    
    if (server.reconnectAttempts! < this.MAX_RECONNECT_ATTEMPTS) {
      server.reconnectAttempts = (server.reconnectAttempts || 0) + 1;
      console.log(`🔄 Attempting to reconnect ${server.name} (attempt ${server.reconnectAttempts})`);
      
      // Wait before reconnecting (exponential backoff)
      setTimeout(() => {
        this.connectToServer(server);
      }, Math.pow(2, server.reconnectAttempts!) * 1000);
    } else {
      console.error(`❌ Max reconnection attempts reached for ${server.name}`);
    }

    this.servers.set(serverId, server);
    this.notifyListeners();
  }

  private handleConnectionClose(serverId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      console.log(`📤 Connection closed for ${server.name}`);
      server.status = 'disconnected';
      server.error = undefined;
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
        console.log(`🔌 Disconnecting ${server?.name}...`);
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

    // Also update backend
    try {
      await this.apiRequest(`/api/mcp/servers/${serverId}/disconnect`, {
        method: 'POST'
      });
    } catch (error) {
      console.warn('Failed to update backend disconnect status:', error);
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
    const connection = this.connections.get(serverId);
    const server = this.servers.get(serverId);
    
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (server.status !== 'connected') {
      throw new Error(`Server ${server.name} is not connected (status: ${server.status})`);
    }

    // Try direct MCP connection first if available
    if (connection) {
      try {
        console.log(`🔧 Calling tool ${toolName} on ${server.name} via direct connection...`);
        
        const result = await (connection as any).sendRequest('tools/call', {
          name: toolName,
          arguments: toolArgs
        });
        
        console.log(`✅ Tool ${toolName} executed successfully on ${server.name} via direct connection`);
        return result;
        
      } catch (error) {
        console.warn(`⚠️ Direct tool call failed for ${toolName} on ${server.name}, falling back to HTTP API:`, error.message);
      }
    }
    
    // Fallback to HTTP API (this is the reliable approach)
    try {
      console.log(`🔧 Calling tool ${toolName} on ${server.name} via HTTP API...`);
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
      
      console.log(`✅ Tool ${toolName} executed successfully on ${server.name} via HTTP API`);
      return data.result;
      
    } catch (error) {
      console.error(`❌ Tool call failed for ${toolName} on ${server.name}:`, error);
      throw new Error(`Tool call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refreshTools(serverId: string): Promise<void> {
    console.log(`🔄 RefreshTools called for server ID: ${serverId}`);
    
    const connection = this.connections.get(serverId);
    const server = this.servers.get(serverId);
    
    if (!server) {
      console.warn(`⚠️ Server ${serverId} not found for refresh`);
      return;
    }
    
    if (connection && server.status === 'connected') {
      // Use direct MCP connection if available
      console.log(`🔄 Refreshing tools via MCP connection for ${server.name}...`);
      try {
        await this.fetchServerCapabilities(serverId);
        return;
      } catch (error) {
        console.warn(`⚠️ Direct MCP refresh failed, falling back to HTTP API:`, error.message);
      }
    }
    
    // Fallback to HTTP API (this is the working approach)
    console.log(`🔄 Refreshing tools via HTTP API for server ${serverId}...`);
    try {
      const response = await this.apiRequest(`/api/mcp/servers/${serverId}/tools`);
      
      if (response.ok) {
        const data = await response.json();
        if (server) {
          const oldToolCount = server.tools?.length || 0;
          server.tools = data.tools || [];
          
          // Update status to connected if we got successful response
          if (server.status === 'error' || server.status === 'disconnected') {
            server.status = 'connected';
            server.error = undefined;
            server.lastConnected = new Date().toISOString();
          }
          
          this.servers.set(serverId, server);
          this.notifyListeners();
          
          console.log(`✅ Tools refreshed for ${server.name}: ${oldToolCount} -> ${server.tools.length} tools`);
        }
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`❌ HTTP API refresh failed for ${server.name}:`, error);
      // Update server error status
      if (server) {
        server.status = 'error';
        server.error = error instanceof Error ? error.message : 'Failed to refresh tools';
        this.servers.set(serverId, server);
        this.notifyListeners();
      }
      throw error; // Re-throw to let caller handle
    }
  }

  // Add refresh method for frontend
  async refreshServers(): Promise<void> {
    console.log('🔄 Refreshing all servers...');
    try {
      // Reload servers from backend
      await this.loadSavedServers();
      
      // Also refresh capabilities for connected servers
      const connectedServers = Array.from(this.servers.values()).filter(s => 
        s.status === 'connected' && this.connections.has(s.id)
      );
      
      console.log(`🔍 Found ${connectedServers.length} connected servers to refresh capabilities`);
      
      for (const server of connectedServers) {
        try {
          console.log(`🔄 Refreshing capabilities for connected server: ${server.name}`);
          await this.fetchServerCapabilities(server.id);
        } catch (error) {
          console.warn(`Failed to refresh capabilities for ${server.name}:`, error);
        }
      }
      
      console.log('✅ Server refresh completed');
    } catch (error) {
      console.error('❌ Server refresh failed:', error);
      throw error;
    }
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

