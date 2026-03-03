# Apple MCP Servers

A collection of [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers that provide AI assistants with access to native Apple applications on macOS.

## Servers

| Server | Status | Description |
|--------|--------|-------------|
| [Apple Notes](#apple-notes) | Done | Read, create, update, and delete notes and folders |
| [Apple Messages](#apple-messages) | Done | Read message history, search conversations, and send messages |
| Apple Contacts | Planned | Manage contacts and contact groups |
| Apple Mail | Planned | Read, send, and manage email |
| Apple Reminders | Planned | Create and manage reminders and lists |
| Apple Calendar | Planned | Manage calendar events and schedules |
| Apple Maps | Planned | Search locations, get directions, and place details |

## Requirements

- **macOS** (uses AppleScript and macOS-specific APIs)
- **Node.js** 22.x or later
- **Full Disk Access** granted to your terminal app (System Settings > Privacy & Security > Full Disk Access) — required for reading the Messages database

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/griches/apple-mcp.git
cd apple-mcp
```

### 2. Build the servers

```bash
# Apple Notes
cd notes
npm install
npm run build

# Apple Messages
cd ../messages
npm install
npm run build
```

### 3. Configure your MCP client

Add the servers to your MCP client configuration (e.g. Claude Code `.mcp.json`, Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "apple-notes": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/notes/build/index.js"]
    },
    "apple-messages": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/messages/build/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/` with the actual path to your cloned repository.

---

## Apple Notes

An MCP server that interacts with Apple Notes via AppleScript.

### Tools

| Tool | Description |
|------|-------------|
| `list_folders` | List all folders in Apple Notes |
| `create_folder` | Create a new folder |
| `list_notes` | List all notes in a folder |
| `get_note` | Get the full content of a note by title |
| `create_note` | Create a new note (HTML body) in a folder |
| `update_note` | Update the body of an existing note |
| `delete_note` | Delete a note |
| `search_notes` | Search notes by keyword across folders |

### Usage Examples

- "List my Apple Notes folders"
- "Get my Shopping note"
- "Create a note called Meeting Notes in my Work folder"
- "Search my notes for recipes"

---

## Apple Messages

An MCP server that reads messages from the macOS Messages database (SQLite) and sends messages via AppleScript.

### Tools

| Tool | Description |
|------|-------------|
| `list_chats` | List recent chats with last message preview |
| `get_chat_messages` | Get message history for a specific chat |
| `search_messages` | Search messages by text content |
| `send_message` | Send an iMessage or SMS |
| `get_chat_participants` | Get participants of a chat |

### Permissions

- **Reading messages**: Requires Full Disk Access for your terminal app to read `~/Library/Messages/chat.db`
- **Sending messages**: macOS will prompt you to allow your terminal app to control the Messages app via AppleScript

### Usage Examples

- "Show my recent messages"
- "Search my messages for flight confirmation"
- "Send a message to +1234567890 saying I'm on my way"

---

## Development

Each server is a standalone TypeScript project in its own directory.

```bash
# Run tests for Notes
cd notes
npm test

# Run tests for Messages
cd messages
npm test
```

## License

MIT
