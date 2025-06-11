import { useState, useEffect, useCallback } from 'react';
import type { MCPServer, MCPTool } from '../services/mcpClient';
import { mcpClient } from '../services/mcpClient';

export function useMCPServers() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = mcpClient.subscribe(setServers);
    
    // Load saved servers on mount
    mcpClient.loadSavedServers().finally(() => setIsLoading(false));

    return unsubscribe;
  }, []);

  const connectServer = useCallback(async (serverConfig: Omit<MCPServer, 'status' | 'capabilities' | 'tools' | 'resources' | 'prompts' | 'reconnectAttempts'>) => {
    await mcpClient.connectToServer(serverConfig);
  }, []);

  const disconnectServer = useCallback(async (serverId: string) => {
    await mcpClient.disconnectServer(serverId);
  }, []);

  const refreshTools = useCallback(async (serverId: string) => {
    await mcpClient.refreshTools(serverId);
  }, []);

  const saveServer = useCallback(async (server: Omit<MCPServer, 'status' | 'capabilities' | 'tools' | 'resources' | 'prompts' | 'reconnectAttempts'>) => {
    await mcpClient.saveServer(server);
  }, []);

  const deleteServer = useCallback(async (serverId: string) => {
    await mcpClient.deleteServer(serverId);
  }, []);

  return {
    servers,
    isLoading,
    connectServer,
    disconnectServer,
    refreshTools,
    saveServer,
    deleteServer
  };
}

export function useMCPTools(serverId?: string) {
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!serverId) {
      setTools([]);
      return;
    }

    const unsubscribe = mcpClient.subscribe((servers) => {
      const server = servers.find(s => s.id === serverId);
      setTools(server?.tools || []);
    });

    return unsubscribe;
  }, [serverId]);

  const callTool = useCallback(async (toolName: string, toolArgs: Record<string, any>) => {
    if (!serverId) throw new Error('No server selected');
    
    setIsLoading(true);
    try {
      const result = await mcpClient.callTool(serverId, toolName, toolArgs);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [serverId]);

  return {
    tools,
    isLoading,
    callTool
  };
}
