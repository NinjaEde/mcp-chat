// API-Client für das MCP Chat Frontend

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Basis API-Request Funktion
export async function apiRequest(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  
  try {
    const response = await fetch(`${API_URL}${path}`, { 
      ...options, 
      headers 
    });
    
    const data = await response.text();
    
    if (!response.ok) {
      let errorMessage = 'API-Fehler';
      try {
        const errorData = JSON.parse(data);
        errorMessage = errorData.error || errorMessage;
      } catch {
        errorMessage = data || errorMessage;
      }
      throw new Error(errorMessage);
    }
    
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  } catch (error) {
    console.error('API Request failed:', error);
    throw error;
  }
}

// Auth API
export const authAPI = {
  login: async (username: string, password: string) => {
    const response = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    
    if (response.success && response.token) {
      localStorage.setItem('token', response.token);
      localStorage.setItem('user', JSON.stringify(response.user));
    }
    
    return response;
  },
  
  logout: async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  },
  
  register: async (username: string, password: string, role = 'user') => {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
  },
  
  getMe: async () => {
    return apiRequest('/auth/me');
  }
};

// Chat API
export const chatAPI = {
  getConversations: async () => {
    return apiRequest('/conversations');
  },
  
  createConversation: async (title?: string, ai_connection_id?: number) => {
    return apiRequest('/conversations', {
      method: 'POST',
      body: JSON.stringify({ title, ai_connection_id })
    });
  },
  
  getMessages: async (conversationId: number) => {
    return apiRequest(`/conversations/${conversationId}/messages`);
  },
  
  sendMessage: async (conversationId: number, text: string, aiConnectionId?: number, model?: string, stream: boolean = true) => {
    return apiRequest(`/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ 
        content: text, 
        ai_connection_id: aiConnectionId,
        model,
        stream
      })
    });
  },
  
  deleteConversation: async (conversationId: number) => {
    const data = await apiRequest(`/conversations/${conversationId}`, {
      method: 'DELETE'
    });
    return data;
  }
};

// Tools API
export const toolsAPI = {
  getAll: async () => {
    return await apiRequest('/tools');
  },

  create: async (tool: {
    name: string;
    type: string;
    description?: string;
    config: {
      protocol: 'sse' | 'http-stream' | 'stdio';
      endpoint?: string;
      command?: string;
      args?: string[];
    };
  }) => {
    return await apiRequest('/tools', {
      method: 'POST',
      body: JSON.stringify(tool)
    });
  },

  update: async (id: number, updates: any) => {
    return await apiRequest(`/tools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  delete: async (id: number) => {
    return await apiRequest(`/tools/${id}`, {
      method: 'DELETE'
    });
  },

  execute: async (id: number, input: any) => {
    return await apiRequest(`/tools/${id}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input })
    });
  },

  testConnection: async (config: any) => {
    return await apiRequest('/tools/test-connection', {
      method: 'POST',
      body: JSON.stringify({ config })
    });
  }
};

// AI Connections API
export const aiConnectionsAPI = {
  getAll: async () => {
    return await apiRequest('/ai-connections');
  },

  create: async (connection: {
    name: string;
    provider: 'openai' | 'ollama' | 'anthropic' | 'custom';
    description?: string;
    config: {
      apiKey?: string;
      endpoint?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    };
  }) => {
    return await apiRequest('/ai-connections', {
      method: 'POST',
      body: JSON.stringify(connection)
    });
  },

  update: async (id: number, updates: any) => {
    return await apiRequest(`/ai-connections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  delete: async (id: number) => {
    return await apiRequest(`/ai-connections/${id}`, {
      method: 'DELETE'
    });
  },

  testConnection: async (id: number) => {
    return await apiRequest(`/ai-connections/${id}/test`, {
      method: 'POST'
    });
  },

  getAvailableModels: async (id: number) => {
    return await apiRequest(`/ai-connections/${id}/models`);
  }
};

// MCP Servers API
export const mcpServersAPI = {
  getAll: async () => {
    return await apiRequest('/mcp-servers');
  },

  create: async (server: {
    name: string;
    endpoint: string;
    description?: string;
    config: any;
  }) => {
    return await apiRequest('/mcp-servers', {
      method: 'POST',
      body: JSON.stringify(server)
    });
  },

  update: async (id: number, updates: any) => {
    return await apiRequest(`/mcp-servers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  },

  delete: async (id: number) => {
    return await apiRequest(`/mcp-servers/${id}`, {
      method: 'DELETE'
    });
  }
};

// Users API (Admin only)
export const usersAPI = {
  getUsers: async () => {
    return apiRequest('/users');
  },
  
  deleteUser: async (userId: number) => {
    return apiRequest(`/users/${userId}`, {
      method: 'DELETE'
    });
  }
};

// System API
export const systemAPI = {
  getHealth: async () => {
    return apiRequest('/health');
  },
  
  getStats: async () => {
    return apiRequest('/admin/stats');
  }
};

// Event Source Handler für Streaming
export class ChatStream {
  private eventSource: EventSource | null = null;
  
  async startStream(
    conversationId: number, 
    message: string, 
    onChunk: (data: any) => void,
    onComplete: () => void,
    onError: (error: any) => void
  ) {
    try {
      const response = await chatAPI.sendMessage(conversationId, message);
      
      if (!response.body) {
        throw new Error('Streaming nicht unterstützt');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          onComplete();
          break;
        }
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              onComplete();
              return;
            }
            
            try {
              const parsed = JSON.parse(data);
              onChunk(parsed);
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }
    } catch (error) {
      onError(error);
    }
  }
  
  stopStream() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

// Utility functions
export const utils = {
  isAuthenticated: () => {
    return !!localStorage.getItem('token');
  },
  
  getCurrentUser: () => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        return JSON.parse(userStr);
      } catch {
        return null;
      }
    }
    return null;
  },
  
  isAdmin: () => {
    const user = utils.getCurrentUser();
    return user && user.role === 'admin';
  }
};

// Deprecated functions for backward compatibility
export async function fetchTools() {
  return toolsAPI.getAll();
}

export async function fetchAIConnections() {
  return aiConnectionsAPI.getAll();
}

export async function fetchUsers() {
  return usersAPI.getUsers();
}
