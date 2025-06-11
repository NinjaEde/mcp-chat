import logger from './logger.js';

class AIService {
  constructor() {
    // Timeout für HTTP-Requests (10 Sekunden)
    this.requestTimeout = 10000;
  }

  async generateResponse(aiConnection, messages, model = null) {
    try {
      const config = JSON.parse(aiConnection.config || '{}');
      
      logger.info('Generating AI response', {
        provider: aiConnection.provider,
        connection_id: aiConnection.id,
        model: model || config.model,
        message_count: messages.length
      });
      
      switch (aiConnection.provider) {
        case 'ollama':
          return await this.generateOllamaResponse(config, messages, model);
        case 'openai':
          return await this.generateOpenAIResponse(config, messages, model);
        case 'demo':
          // Demo-Provider für Tests ohne echte AI-Verbindung
          const demoResponse = `Demo-Antwort auf: "${messages[messages.length - 1]?.content || 'Hallo'}" (${new Date().toLocaleTimeString()})`;
          return demoResponse;
        default:
          throw new Error(`Unsupported AI provider: ${aiConnection.provider}`);
      }
    } catch (error) {
      logger.error('Error generating AI response', { 
        error: error.message, 
        stack: error.stack,
        provider: aiConnection.provider,
        connection_id: aiConnection.id 
      });
      throw error;
    }
  }

  async generateOllamaResponse(config, messages, model) {
    const baseEndpoint = config.endpoint || 'http://localhost:11434';
    const selectedModel = model || config.model || 'llama3.2';
    
    // Docker-spezifische Endpoint-Behandlung
    const endpoints = this.getOllamaEndpoints(baseEndpoint);
    
    logger.info('Making Ollama request', {
      endpoints,
      model: selectedModel,
      message_count: messages.length
    });

    let lastError;
    
    // Versuche verschiedene Endpoints
    for (const endpoint of endpoints) {
      try {
        logger.info(`Trying Ollama endpoint: ${endpoint}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

        const response = await fetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            stream: false
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'No response body');
          throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        logger.info('Ollama response received', {
          endpoint,
          model: selectedModel,
          response_length: data.message?.content?.length || 0
        });

        return data.message?.content || 'Keine Antwort erhalten';

      } catch (error) {
        lastError = error;
        logger.warn(`Failed to connect to Ollama at ${endpoint}`, { 
          error: error.message 
        });
        
        if (error.name === 'AbortError') {
          logger.error(`Ollama request timeout at ${endpoint} after ${this.requestTimeout / 1000} seconds`);
        }
        
        // Wenn es der letzte Endpoint ist, werfe den Fehler
        if (endpoint === endpoints[endpoints.length - 1]) {
          break;
        }
        
        // Kurze Pause vor dem nächsten Versuch
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Alle Endpoints fehlgeschlagen
    if (lastError?.name === 'AbortError') {
      throw new Error(`Ollama request timeout after ${this.requestTimeout / 1000} seconds`);
    }
    if (lastError?.code === 'ECONNREFUSED' || lastError?.message.includes('fetch failed')) {
      throw new Error(`Cannot connect to Ollama. Tried endpoints: ${endpoints.join(', ')}. Is Ollama running and accessible from Docker container?`);
    }
    throw lastError || new Error('Unknown error connecting to Ollama');
  }

  /**
   * Generiert eine Liste von möglichen Ollama-Endpoints für Docker-Umgebung
   */
  getOllamaEndpoints(baseEndpoint) {
    const endpoints = [];
    
    // Ursprünglicher Endpoint
    endpoints.push(baseEndpoint);
    
    // Wenn localhost, füge Docker-spezifische Alternativen hinzu
    if (baseEndpoint.includes('localhost') || baseEndpoint.includes('127.0.0.1')) {
      // Docker Desktop für Mac/Windows: host.docker.internal
      endpoints.push(baseEndpoint.replace(/localhost|127\.0\.0\.1/, 'host.docker.internal'));
      
      // Docker Compose Service-Name (falls Ollama als Service läuft)
      endpoints.push(baseEndpoint.replace(/localhost|127\.0\.0.1/, 'ollama'));
      
      // Host-Netzwerk IP (typische Docker Bridge IP)
      endpoints.push(baseEndpoint.replace(/localhost|127\.0\.0\.1/, '172.17.0.1'));
      
      // Gateway IP für Docker Desktop
      endpoints.push(baseEndpoint.replace(/localhost|127\.0\.0\.1/, '192.168.65.1'));
    }
    
    // Entferne Duplikate
    return [...new Set(endpoints)];
  }

  async generateOpenAIResponse(config, messages, model) {
    const selectedModel = model || config.model || 'gpt-3.5-turbo';
    
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    logger.info('Making OpenAI request', {
      model: selectedModel,
      message_count: messages.length
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          max_tokens: config.maxTokens || 1000,
          temperature: config.temperature || 0.7
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      logger.info('OpenAI response received', {
        model: selectedModel,
        response_length: data.choices?.[0]?.message?.content?.length || 0
      });

      return data.choices?.[0]?.message?.content || 'Keine Antwort erhalten';

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`OpenAI request timeout after ${this.requestTimeout / 1000} seconds`);
      }
      if (error.message.includes('fetch failed')) {
        throw new Error(`Network error connecting to OpenAI: ${error.message}`);
      }
      throw error;
    }
  }

  async generateStreamingResponse(aiConnection, messages, model = null, onChunk = null) {
    try {
      const config = JSON.parse(aiConnection.config || '{}');
      
      logger.info('Generating streaming AI response', {
        provider: aiConnection.provider,
        connection_id: aiConnection.id,
        model: model || config.model,
        message_count: messages.length
      });
      
      switch (aiConnection.provider) {
        case 'ollama':
          return await this.generateOllamaStreamingResponse(config, messages, model, onChunk);
        case 'openai':
          return await this.generateOpenAIStreamingResponse(config, messages, model, onChunk);
        case 'demo':
          return await this.generateDemoStreamingResponse(config, messages, model, onChunk);
        default:
          // Fallback für nicht-streaming Provider
          const response = await this.generateResponse(aiConnection, messages, model);
          if (onChunk) {
            onChunk(response);
          }
          return response;
      }
    } catch (error) {
      logger.error('Error generating streaming AI response', { 
        error: error.message, 
        provider: aiConnection.provider,
        connection_id: aiConnection.id 
      });
      throw error;
    }
  }

  async generateOllamaStreamingResponse(config, messages, model, onChunk) {
    const baseEndpoint = config.endpoint || 'http://localhost:11434';
    const selectedModel = model || config.model || 'llama3.2';
    const endpoints = this.getOllamaEndpoints(baseEndpoint);
    
    let lastError;
    
    for (const endpoint of endpoints) {
      try {
        logger.info(`Trying streaming Ollama endpoint: ${endpoint}`);
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

        const response = await fetch(`${endpoint}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: selectedModel,
            messages: messages.map(msg => ({
              role: msg.role,
              content: msg.content
            })),
            stream: true
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'No response body');
          throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        let fullResponse = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              try {
                const data = JSON.parse(line);
                if (data.message?.content) {
                  const content = data.message.content;
                  fullResponse += content;
                  if (onChunk) {
                    onChunk(content);
                  }
                }
              } catch (parseError) {
                // Ignore malformed JSON lines
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        logger.info('Ollama streaming response completed', {
          endpoint,
          model: selectedModel,
          response_length: fullResponse.length
        });

        return fullResponse || 'Keine Antwort erhalten';

      } catch (error) {
        lastError = error;
        logger.warn(`Failed to stream from Ollama at ${endpoint}`, { 
          error: error.message 
        });
        
        if (endpoint === endpoints[endpoints.length - 1]) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    throw lastError || new Error('Unknown error connecting to Ollama for streaming');
  }

  async generateOpenAIStreamingResponse(config, messages, model, onChunk) {
    const selectedModel = model || config.model || 'gpt-3.5-turbo';
    
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required');
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          max_tokens: config.maxTokens || 1000,
          temperature: config.temperature || 0.7,
          stream: true
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      let fullResponse = '';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                  if (onChunk) {
                    onChunk(content);
                  }
                }
              } catch (parseError) {
                // Ignore malformed JSON lines
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      logger.info('OpenAI streaming response completed', {
        model: selectedModel,
        response_length: fullResponse.length
      });

      return fullResponse || 'Keine Antwort erhalten';

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`OpenAI streaming timeout after ${this.requestTimeout / 1000} seconds`);
      }
      throw error;
    }
  }

  async generateDemoStreamingResponse(config, messages, model, onChunk) {
    logger.info('Generating demo streaming response');
    
    const demoResponses = [
      "Das ist eine simulierte KI-Antwort für das Streaming-System.",
      "Diese Antwort wird Stück für Stück übertragen, um das Live-Streaming zu demonstrieren.",
      "Sie können sehen, wie der Text nach und nach erscheint, genau wie bei echten KI-Providern.",
      "Das System funktioniert mit Ollama, OpenAI und anderen Anbietern.",
      "Vielen Dank für das Testen des MCP Chat Systems!"
    ];
    
    const lastMessage = messages[messages.length - 1];
    const selectedResponse = demoResponses[Math.floor(Math.random() * demoResponses.length)];
    
    // Simuliere personalisierte Antwort basierend auf der Nachricht
    let response = `Ihre Nachricht "${lastMessage?.content || 'Hallo'}" wurde empfangen. `;
    response += selectedResponse;
    response += ` (Antwort simuliert um ${new Date().toLocaleTimeString()})`;
    
    // Streaming-Simulation: Sende die Antwort Wort für Wort
    const words = response.split(' ');
    let fullResponse = '';
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i] + (i < words.length - 1 ? ' ' : '');
      fullResponse += word;
      
      if (onChunk) {
        onChunk(word);
      }
      
      // Simuliere Verzögerung zwischen den Wörtern (50-200ms)
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 150));
    }
    
    logger.info('Demo streaming response completed', {
      response_length: fullResponse.length,
      word_count: words.length
    });
    
    return fullResponse;
  }
}

export default new AIService();
