import db from './db.js';

// Chat-Service für KI-Interaktionen
class ChatService {
  
  // Neue Konversation erstellen
  async createConversation(userId, title, aiConnectionId = null) {
    return new Promise((resolve, reject) => {
      const conversationTitle = title || `Chat ${new Date().toLocaleString('de-DE')}`;
      
      db.run(
        'INSERT INTO conversations (user_id, title, ai_connection_id) VALUES (?, ?, ?)',
        [userId, conversationTitle, aiConnectionId],
        function(err) {
          if (err) {
            console.error('[CHAT] Fehler beim Erstellen der Konversation:', err);
            reject(err);
          } else {
            resolve({
              id: this.lastID,
              title: conversationTitle,
              ai_connection_id: aiConnectionId,
              created_at: new Date().toISOString()
            });
          }
        }
      );
    });
  }

  // Nachrichten zu Konversation hinzufügen
  async addMessage(conversationId, sender, text, toolCalls = null, metadata = null) {
    return new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO messages (conversation_id, sender, text, tool_calls, metadata) VALUES (?, ?, ?, ?, ?)',
        [
          conversationId,
          sender,
          text,
          toolCalls ? JSON.stringify(toolCalls) : null,
          metadata ? JSON.stringify(metadata) : null
        ],
        function(err) {
          if (err) {
            console.error('[CHAT] Fehler beim Hinzufügen der Nachricht:', err);
            reject(err);
          } else {
            // Konversation aktualisieren
            db.run(
              'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [conversationId]
            );
            
            resolve({
              id: this.lastID,
              conversation_id: conversationId,
              sender,
              text,
              tool_calls: toolCalls,
              metadata,
              created_at: new Date().toISOString()
            });
          }
        }
      );
    });
  }

  // Konversationen eines Users abrufen
  async getUserConversations(userId) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT c.*, ac.name as ai_connection_name, ac.type as ai_connection_type,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
         (SELECT text FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message
         FROM conversations c
         LEFT JOIN ai_connections ac ON c.ai_connection_id = ac.id
         WHERE c.user_id = ?
         ORDER BY c.updated_at DESC`,
        [userId],
        (err, rows) => {
          if (err) {
            console.error('[CHAT] Fehler beim Abrufen der Konversationen:', err);
            reject(err);
          } else {
            resolve(rows);
          }
        }
      );
    });
  }

  // Nachrichten einer Konversation abrufen
  async getConversationMessages(conversationId, userId) {
    return new Promise((resolve, reject) => {
      // Erst prüfen, ob User Zugriff auf Konversation hat
      db.get(
        'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
        [conversationId, userId],
        (err, conversation) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (!conversation) {
            reject(new Error('Konversation nicht gefunden oder keine Berechtigung'));
            return;
          }

          // Nachrichten abrufen
          db.all(
            'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
            [conversationId],
            (err, rows) => {
              if (err) {
                console.error('[CHAT] Fehler beim Abrufen der Nachrichten:', err);
                reject(err);
              } else {
                // JSON-Felder parsen
                const messages = rows.map(msg => ({
                  ...msg,
                  tool_calls: msg.tool_calls ? JSON.parse(msg.tool_calls) : null,
                  metadata: msg.metadata ? JSON.parse(msg.metadata) : null
                }));
                resolve(messages);
              }
            }
          );
        }
      );
    });
  }

  // Konversation löschen
  async deleteConversation(conversationId, userId) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Erst prüfen, ob User Berechtigung hat
        db.get(
          'SELECT id FROM conversations WHERE id = ? AND user_id = ?',
          [conversationId, userId],
          (err, conversation) => {
            if (err || !conversation) {
              reject(new Error('Konversation nicht gefunden oder keine Berechtigung'));
              return;
            }

            // Nachrichten löschen
            db.run('DELETE FROM messages WHERE conversation_id = ?', [conversationId]);
            
            // Konversation löschen
            db.run('DELETE FROM conversations WHERE id = ?', [conversationId], function(err) {
              if (err) {
                console.error('[CHAT] Fehler beim Löschen der Konversation:', err);
                reject(err);
              } else {
                resolve({ deleted: this.changes });
              }
            });
          }
        );
      });
    });
  }

  // KI-Antwort simulieren (für Demo-Zwecke)
  async generateAIResponse(messages, aiConnectionId = null) {
    // Hier würde normalerweise die echte KI-API aufgerufen werden
    const responses = [
      "Das ist eine interessante Frage! Lass mich darüber nachdenken...",
      "Basierend auf den verfügbaren Informationen kann ich folgendes sagen:",
      "Hier sind einige Punkte, die du beachten solltest:",
      "Das ist ein komplexes Thema. Lass mich es für dich aufschlüsseln:",
      "Gerne helfe ich dir dabei! Hier ist mein Vorschlag:",
      "Das kann ich dir beantworten. Folgende Aspekte sind wichtig:"
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    // Simuliere Verarbeitungszeit
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    return {
      text: randomResponse,
      metadata: {
        model: aiConnectionId ? 'connected-ai' : 'demo-ai',
        tokens_used: Math.floor(Math.random() * 100) + 50,
        response_time: Math.floor(Math.random() * 2000) + 500
      }
    };
  }

  // Tool-Ausführung simulieren
  async executeTool(toolId, parameters) {
    return new Promise((resolve) => {
      // Tool-Informationen abrufen
      db.get('SELECT * FROM tools WHERE id = ? AND enabled = 1', [toolId], (err, tool) => {
        if (err || !tool) {
          resolve({
            success: false,
            error: 'Tool nicht gefunden oder deaktiviert'
          });
          return;
        }

        // Simuliere Tool-Ausführung
        setTimeout(() => {
          const results = {
            'search': `Suchergebnisse für "${parameters.query || 'Demo-Suche'}": Hier sind relevante Informationen...`,
            'calc': `Berechnung: ${parameters.expression || '2+2'} = ${eval(parameters.expression || '2+2')}`,
            'filesystem': `Dateioperation durchgeführt: ${parameters.action || 'Datei gelesen'}`
          };

          const toolType = tool.name.toLowerCase().includes('suche') ? 'search' :
                          tool.name.toLowerCase().includes('rechner') ? 'calc' : 'filesystem';

          resolve({
            success: true,
            result: results[toolType] || `Tool "${tool.name}" wurde erfolgreich ausgeführt.`,
            tool_name: tool.name,
            execution_time: Math.floor(Math.random() * 1000) + 200
          });
        }, 500 + Math.random() * 1000);
      });
    });
  }
}

export default new ChatService();
