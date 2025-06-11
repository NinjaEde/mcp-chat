import { useEffect, useRef, useCallback, useState } from 'react';

interface SSEMessage {
  type: 'connected' | 'chunk' | 'complete' | 'error';
  content?: string;
  conversation_id?: number;
  message_id?: number;
}

interface UseSSEOptions {
  conversationId: number;
  onChunk?: (content: string) => void;
  onComplete?: (messageId: number) => void;
  onError?: (error: string) => void;
  enabled?: boolean;
}

export function useSSE({ conversationId, onChunk, onComplete, onError, enabled = false }: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<string>('');

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      console.log('Disconnecting SSE for conversation', conversationId);
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      setIsConnected(false);
      setIsStreaming(false);
      setCurrentStreamingMessage('');
    }
  }, [conversationId]);

  const connect = useCallback(() => {
    // Don't connect if already connected or if not enabled
    if (eventSourceRef.current || !enabled) {
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      console.error('No authentication token available for SSE');
      if (onError) {
        onError('No authentication token available');
      }
      return;
    }

    try {
      console.log('Creating SSE connection for conversation', conversationId);
      
      // Use same API base as the main API client
      const envApiUrl = import.meta.env.VITE_API_URL;
      const API_BASE = envApiUrl ? envApiUrl.replace('/api', '') : 'http://localhost:3001';
      const url = `${API_BASE}/api/conversations/${conversationId}/stream?token=${encodeURIComponent(token)}`;
      
      const eventSource = new EventSource(url);
      
      eventSource.onopen = () => {
        console.log('SSE connection opened for conversation', conversationId);
        setIsConnected(true);
        setCurrentStreamingMessage('');
      };
      
      eventSource.onmessage = (event) => {
        try {
          const data: SSEMessage = JSON.parse(event.data);
          
          switch (data.type) {
            case 'connected':
              console.log('SSE connected to conversation', conversationId);
              setIsConnected(true);
              break;
            case 'chunk':
              if (data.content) {
                setIsStreaming(true);
                setCurrentStreamingMessage(prev => {
                  const newContent = prev + data.content;
                  if (onChunk && data.content) {
                    onChunk(data.content);
                  }
                  return newContent;
                });
              }
              break;
            case 'complete':
              console.log('Streaming complete for conversation', conversationId);
              setIsStreaming(false);
              if (data.message_id && onComplete) {
                onComplete(data.message_id);
              }
              // Disconnect after completion to clean up
              setTimeout(() => {
                setCurrentStreamingMessage('');
                console.log('Auto-disconnecting SSE after completion');
                disconnect();
              }, 1000); // Reduced delay
              break;
            case 'error':
              console.error('Streaming error:', data.content);
              setIsStreaming(false);
              if (data.content && onError) {
                onError(data.content);
              }
              setCurrentStreamingMessage('');
              // Disconnect after error
              setTimeout(() => {
                disconnect();
              }, 500); // Reduced delay
              break;
          }
        } catch (error) {
          console.error('Error parsing SSE message:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('SSE error for conversation', conversationId, error);
        setIsConnected(false);
        setIsStreaming(false);
        
        if (onError) {
          onError('SSE connection failed');
        }
        
        // Clean disconnect on error
        disconnect();
      };
      
      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('Failed to create SSE connection:', error);
      if (onError) {
        onError('Failed to establish streaming connection');
      }
    }
  }, [conversationId, onChunk, onComplete, onError, enabled, disconnect]);

  const startStreaming = useCallback(() => {
    console.log('Starting streaming for conversation', conversationId);
    setCurrentStreamingMessage('');
    connect();
  }, [connect, conversationId]);

  const stopStreaming = useCallback(() => {
    console.log('Stopping streaming for conversation', conversationId);
    setIsStreaming(false);
    disconnect();
  }, [disconnect, conversationId]);

  // Cleanup on unmount or conversation change
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [conversationId, disconnect]);

  return {
    isConnected,
    isStreaming,
    currentStreamingMessage,
    startStreaming,
    stopStreaming,
    connect: startStreaming,
    disconnect: stopStreaming
  };
}