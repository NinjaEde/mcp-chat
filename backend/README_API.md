# API-Übersicht MCP Chat Backend

## Authentifizierung
- `POST /api/auth/login` – Login (username, password)
- `POST /api/auth/register` – Registrierung (username, password)

## Tools
- `GET /api/tools` – Alle Tools (auth)
- `POST /api/tools` – Tool anlegen (auth)
- `DELETE /api/tools/:id` – Tool löschen (auth)

## KI-Verbindungen
- `GET /api/ai-connections` – Alle KI-Verbindungen (auth)
- `POST /api/ai-connections` – KI-Verbindung anlegen (auth)
- `DELETE /api/ai-connections/:id` – KI-Verbindung löschen (auth)

## Benutzer
- `GET /api/users` – Alle Benutzer (nur Admin)

## Konversationen
- `GET /api/conversations` – Eigene Konversationen (auth)
- `POST /api/conversations` – Neue Konversation (auth)
- `GET /api/conversations/:id/messages` – Nachrichten einer Konversation (auth)
- `POST /api/conversations/:id/messages` – Nachricht senden (auth)

## Sicherheit & Logging
- JWT, bcrypt, Rate-Limiting, CORS, Input-Sanitization, Fehler-Logging
