# Backend Tests

Dieses Verzeichnis enthält automatisierte Tests für das MCP Chat Backend.

## Test-Struktur

```
tests/
├── setup.js                 # Test-Setup und globale Konfiguration
├── helpers/
│   └── testApp.js           # Test-App-Erstellung und Hilfsfunktionen
├── api.test.js              # Allgemeine API-Tests (Health, CORS, etc.)
├── auth.test.js             # Authentifizierungs-Tests
├── conversations.test.js    # Konversations-API-Tests
├── tools.test.js            # Tools-API-Tests
└── database.test.js         # Datenbank-Tests
```

## Test-Ausführung

### Alle Tests ausführen
```bash
npm test
```

### Tests mit Überwachung (Watch-Mode)
```bash
npm run test:watch
```

### Tests mit Code-Coverage
```bash
npm run test:coverage
```

### Tests mit detaillierter Ausgabe
```bash
npm run test:verbose
```

## Test-Kategorien

### 1. Authentication Tests (`auth.test.js`)
- Login mit gültigen/ungültigen Credentials
- JWT Token-Generierung und -Validierung
- Passwort-Hashing und -Verifikation

### 2. Conversations API Tests (`conversations.test.js`)
- Konversationen abrufen (GET)
- Konversationen erstellen (POST)
- Konversationen löschen (DELETE)
- Integrations-Tests für den vollständigen Workflow

### 3. Tools API Tests (`tools.test.js`)
- Tools abrufen (GET)
- Tools erstellen (POST)
- Komplexe Tool-Konfigurationen
- Integrations-Tests

### 4. General API Tests (`api.test.js`)
- Health Check
- CORS-Headers
- Error Handling
- Request Validation

### 5. Database Tests (`database.test.js`)
- Datenbank-Initialisierung
- Tabellen-Schema-Validierung
- CRUD-Operationen
- Foreign Key Constraints
- Eindeutigkeits-Constraints

## Test-Environment

Die Tests verwenden eine separate Test-Datenbank (`test.db`), die automatisch für jeden Test-Lauf erstellt und nach Abschluss gelöscht wird.

### Umgebungsvariablen für Tests
- `NODE_ENV=test`
- `DB_PATH=database/test.db`
- `JWT_SECRET=test-secret`

## Test-Helper

### `createTestApp()`
Erstellt eine Express-App-Instanz mit allen API-Routen für Tests.

### `createTestUserAndToken(app)`
Erstellt einen Test-Benutzer und gibt ein Authentifizierungs-Token zurück.

## Best Practices

1. **Isolation**: Jeder Test läuft in einer isolierten Umgebung
2. **Cleanup**: Test-Datenbank wird nach jedem Test-Lauf bereinigt
3. **Authentifizierung**: Tests verwenden echte JWT-Token
4. **Async/Await**: Moderne JavaScript-Syntax für bessere Lesbarkeit
5. **Assertions**: Umfassende Überprüfungen für alle Szenarien

## Debugging

Für Debugging können Sie einzelne Test-Dateien ausführen:

```bash
npx jest tests/auth.test.js --verbose
npx jest tests/conversations.test.js --verbose
```

## CI/CD Integration

Die Tests sind so konfiguriert, dass sie in CI/CD-Pipelines ausgeführt werden können:

```yaml
# Beispiel für GitHub Actions
- name: Run Tests
  run: |
    cd backend
    npm install
    npm test
```

## Coverage Reports

Code-Coverage-Reports werden im `coverage/` Verzeichnis generiert:

```bash
npm run test:coverage
# Öffne coverage/lcov-report/index.html im Browser
```
