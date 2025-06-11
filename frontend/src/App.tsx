import React, { useState, useRef, useEffect } from 'react';
import { authAPI, chatAPI, toolsAPI, aiConnectionsAPI } from './api';
import '../index.css';
import LoginForm from './components/LoginForm';
import Sidebar from './components/Sidebar';
import ChatHeader from './components/ChatHeader';
import MessageList from './components/MessageList';
import MessageInput from './components/MessageInput';
import ToolsDialog from './components/ToolsDialog';
import AIDialog from './components/AIDialog';
import { useSSE } from './hooks/useSSE';
import ChatStatusBar from './components/ChatStatusBar';

// Erweiterte Typen
interface Message {
  id: number;
  conversation_id?: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at?: string;
  metadata?: any;
}

interface Conversation {
  id: number;
  title: string;
  user_id: number;
  ai_connection_id?: number;
  created_at: string;
  updated_at?: string;
  message_count?: number;
  messages?: Message[];
}

interface Tool {
  id: number;
  name: string;
  type: string;
  description: string;
  config: {
    protocol: 'sse' | 'http-stream' | 'stdio';
    endpoint?: string;
    command?: string;
    args?: string[];
  };
  is_active: boolean;
  created_at: string;
}

interface AIConnection {
  id: number;
  name: string;
  provider: 'openai' | 'ollama' | 'anthropic' | 'custom';
  description: string;
  config: {
    apiKey?: string;
    endpoint?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  is_active: boolean;
  status?: 'connected' | 'disconnected' | 'error';
  availableModels?: string[];
}

interface User {
  id: number;
  username: string;
  role: 'admin' | 'moderator' | 'user';
  created_at: string;
}

function App() {
  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Chat State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingEnabled, setStreamingEnabled] = useState(true);

  // Tools & AI State
  const [tools, setTools] = useState<Tool[]>([]);
  const [aiConnections, setAIConnections] = useState<AIConnection[]>([]);
  const [selectedAIConnection, setSelectedAIConnection] = useState<number | null>(null);

  // UI State
  const [showSidebar, setShowSidebar] = useState(true);
  const [showToolsDialog, setShowToolsDialog] = useState(false);
  const [showAIDialog, setShowAIDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  // Refs
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingMessage]);

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
      try {
        setCurrentUser(JSON.parse(user));
        setIsAuthenticated(true);
        loadInitialData();
      } catch (error) {
        console.error('Invalid stored user data:', error);
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
  }, []);

  // Dark mode effect
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Load initial data
  const loadInitialData = async () => {
    try {
      const [conversationsData, toolsData, aiConnectionsData] = await Promise.all([
        chatAPI.getConversations(),
        toolsAPI.getAll(),
        aiConnectionsAPI.getAll()
      ]);

      if (conversationsData.success) {
        setConversations(conversationsData.conversations);
      }
      if (toolsData.success) {
        setTools(toolsData.tools);
      }
      if (aiConnectionsData.success) {
        setAIConnections(aiConnectionsData.ai_connections);
      }
    } catch (error) {
      console.error('Error loading initial data:', error);
    }
  };

  // Authentication
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setIsAuthenticated(true);
    loadInitialData();
  };

  const handleLogout = async () => {
    try {
      await authAPI.logout();
      setIsAuthenticated(false);
      setCurrentUser(null);
      setConversations([]);
      setActiveConversation(null);
      setMessages([]);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Conversations
  const createConversation = async (title?: string) => {
    try {
      const response = await chatAPI.createConversation(title, selectedAIConnection || undefined);
      if (response.success) {
        const newConversation = response.conversation;
        setConversations(prev => [newConversation, ...prev]);
        setActiveConversation(newConversation);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error creating conversation:', error);
    }
  };

  const selectConversation = async (conversation: Conversation) => {
    setActiveConversation(conversation);
    setMessages([]);
    setLoading(true);

    try {
      const response = await chatAPI.getMessages(conversation.id);
      if (response.success && response.conversation.messages) {
        setMessages(response.conversation.messages);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const deleteConversation = async (conversationId: number) => {
    if (!confirm('Möchten Sie diese Unterhaltung wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return;
    }

    try {
      const response = await chatAPI.deleteConversation(conversationId);
      if (response.success) {
        // Remove from conversations list
        setConversations(prev => prev.filter(conv => conv.id !== conversationId));
        
        // If this was the active conversation, clear it
        if (activeConversation?.id === conversationId) {
          setActiveConversation(null);
          setMessages([]);
        }
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
      alert('Fehler beim Löschen der Unterhaltung: ' + (error as Error).message);
    }
  };

  // SSE Hook for streaming - only connect when needed
  const { isConnected, isStreaming: sseIsStreaming, startStreaming, stopStreaming } = useSSE({
    conversationId: activeConversation?.id || 0,
    enabled: streamingEnabled,
    onChunk: (content: string) => {
      console.log('SSE chunk received:', content);
      setStreamingMessage(prev => prev + content);
      setIsStreaming(true);
    },
    onComplete: (messageId: number) => {
      console.log('SSE stream complete:', { messageId, streamingMessage });
      // Use a callback to ensure we get the latest streamingMessage value
      setStreamingMessage(currentMessage => {
        if (currentMessage.trim() && activeConversation) {
          const newMessage: Message = {
            id: messageId,
            conversation_id: activeConversation.id,
            role: 'assistant',
            content: currentMessage,
            created_at: new Date().toISOString()
          };
          setMessages(prev => [...prev, newMessage]);
          console.log('Added streamed message to messages:', newMessage);
        }
        return ''; // Clear streaming message
      });
      setIsStreaming(false);
      setLoading(false);
    },
    onError: (error: string) => {
      console.error('SSE streaming error:', error);
      if (activeConversation) {
        const errorMessage: Message = {
          id: Date.now(),
          conversation_id: activeConversation.id,
          role: 'assistant',
          content: `Fehler: ${error}`,
          created_at: new Date().toISOString()
        };
        setMessages(prev => [...prev, errorMessage]);
      }
      setStreamingMessage('');
      setIsStreaming(false);
      setLoading(false);
    }
  });

  // Send message with streaming support
  const handleSendMessage = async (e: React.FormEvent, streaming: boolean = true) => {
    e.preventDefault();
    if (!input.trim() || !activeConversation) return;

    const userMessage: Message = {
      id: Date.now(),
      conversation_id: activeConversation.id,
      role: 'user',
      content: input,
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setStreamingMessage('');
    setIsStreaming(false);

    const shouldUseStreaming = streaming && streamingEnabled;

    console.log('Sending message:', { 
      conversationId: activeConversation.id, 
      streaming: shouldUseStreaming, 
      streamingEnabled
    });

    // Start SSE connection before sending ONLY if streaming is enabled
    if (shouldUseStreaming) {
      startStreaming();
    }

    try {
      const response = await chatAPI.sendMessage(
        activeConversation.id, 
        userMessage.content, 
        selectedAIConnection || undefined,
        undefined, // model
        shouldUseStreaming
      );
      
      console.log('Send message response:', response);
      
      if (response.success) {
        if (!shouldUseStreaming || !response.streaming) {
          // For non-streaming responses, wait for the AI response
          console.log('Non-streaming mode: waiting for AI response...');
          
          // Set a short delay to allow backend processing
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          try {
            // Reload messages to get the AI response
            const messageResponse = await chatAPI.getMessages(activeConversation.id);
            if (messageResponse.success && messageResponse.conversation.messages) {
              console.log('Reloaded messages:', messageResponse.conversation.messages.length);
              setMessages(messageResponse.conversation.messages);
            } else {
              console.error('Failed to reload messages:', messageResponse);
            }
          } catch (reloadError) {
            console.error('Error reloading messages:', reloadError);
          }
          
          setLoading(false);
        } else {
          console.log('Streaming response initiated, waiting for SSE...');
          // Set a timeout to fallback if streaming doesn't work
          setTimeout(() => {
            if (loading) {
              console.log('Streaming timeout, stopping SSE and reloading messages...');
              stopStreaming();
              // Reload messages as fallback
              chatAPI.getMessages(activeConversation.id).then(messageResponse => {
                if (messageResponse.success && messageResponse.conversation.messages) {
                  setMessages(messageResponse.conversation.messages);
                }
                setLoading(false);
              }).catch(error => {
                console.error('Error reloading messages:', error);
                setLoading(false);
              });
            }
          }, 30000); // 30 second timeout
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setLoading(false);
      if (shouldUseStreaming) {
        stopStreaming();
      }
      
      // Add error message to chat
      const errorMessage: Message = {
        id: Date.now(),
        conversation_id: activeConversation.id,
        role: 'assistant',
        content: `Fehler beim Senden der Nachricht: ${(error as Error).message}`,
        created_at: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  // Render login form
  if (!isAuthenticated) {
    return <LoginForm onLoginSuccess={handleLoginSuccess} darkMode={darkMode} />;
  }

  // Main chat interface
  return (
    <div className={`flex h-screen bg-gray-50 dark:bg-gray-900 ${darkMode ? 'dark' : ''}`}>
      {/* Sidebar */}
      {showSidebar && (
        <Sidebar
          conversations={conversations}
          activeConversation={activeConversation}
          setActiveConversation={setActiveConversation}
          selectConversation={selectConversation}
          deleteConversation={deleteConversation}
          createConversation={createConversation}
          showSettings={() => setShowSettings(true)}
          handleLogout={handleLogout}
          setShowToolsDialog={setShowToolsDialog}
          setShowAIDialog={setShowAIDialog}
          aiConnections={aiConnections}
          selectedAIConnection={selectedAIConnection}
          setSelectedAIConnection={setSelectedAIConnection}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">                
        {/* Chat Header */}
        <ChatHeader
          showSidebar={showSidebar}
          setShowSidebar={setShowSidebar}
          activeConversation={activeConversation}
          aiConnections={aiConnections}
          selectedAIConnection={selectedAIConnection}
        />       

        <ChatStatusBar isConnected={isConnected} isStreaming={sseIsStreaming || isStreaming || loading}></ChatStatusBar>
        {/* Messages */}
        <MessageList
          activeConversation={activeConversation}
          messages={messages}
          loading={loading}
          streamingMessage={streamingMessage}
          isStreaming={isStreaming}
          chatEndRef={chatEndRef}
          createConversation={createConversation}
        />


        {/* Message Input */}
        {activeConversation && (
          <MessageInput
            input={input}
            setInput={setInput}
            handleSendMessage={handleSendMessage}
            loading={loading}
            streamingEnabled={streamingEnabled}
            setStreamingEnabled={setStreamingEnabled}
          />
        )}

      </div>

      {/* Tools Configuration Dialog */}
      {showToolsDialog && (
        <ToolsDialog
          tools={tools}
          onClose={() => setShowToolsDialog(false)}
          onToolsChange={setTools}
        />
      )}

      {/* AI Configuration Dialog */}
      {showAIDialog && (
        <AIDialog
          aiConnections={aiConnections}
          onClose={() => setShowAIDialog(false)}
          onAIConnectionsChange={setAIConnections}
        />
      )}
    </div>
  );
}

export default App;
