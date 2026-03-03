# Apple MCP Servers

A collection of [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers that provide AI assistants with access to native Apple applications on macOS.

## Servers

| Server | Status | Description |
|--------|--------|-------------|
| [Apple Notes](#apple-notes) | Done | Read, create, update, and delete notes and folders |
| [Apple Messages](#apple-messages) | Done | Read message history, search conversations, and send messages |
| [Apple Contacts](#apple-contacts) | Done | Manage contacts and contact groups |
| Apple Mail | Planned | Read, send, and manage email |
| Apple Reminders | Planned | Create and manage reminders and lists |
| Apple Calendar | Planned | Manage calendar events and schedules |
| Apple Maps | Planned | Search locations, get directions, and place details |

## Requirements

- **macOS** (uses AppleScript and macOS-specific APIs)
- **Node.js** 18+ (22+ for Apple Messages)
- **Full Disk Access** granted to your terminal app (System Settings > Privacy & Security > Full Disk Access) — required for reading the Messages database

## Quick Start

No cloning or building required — install and run directly with `npx`:

```bash
# Apple Notes
npx @griches/apple-notes-mcp

# Apple Messages
npx @griches/apple-messages-mcp

# Apple Contacts
npx @griches/apple-contacts-mcp
```

### Claude Code

```bash
claude mcp add apple-notes -- npx @griches/apple-notes-mcp
claude mcp add apple-messages -- npx @griches/apple-messages-mcp
claude mcp add apple-contacts -- npx @griches/apple-contacts-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "npx",
      "args": ["@griches/apple-notes-mcp"]
    },
    "apple-messages": {
      "command": "npx",
      "args": ["@griches/apple-messages-mcp"]
    },
    "apple-contacts": {
      "command": "npx",
      "args": ["@griches/apple-contacts-mcp"]
    }
  }
}
```

## Install from Source

If you prefer to build from source:

```bash
git clone https://github.com/griches/apple-mcp.git
cd apple-mcp

# Apple Notes
cd notes && npm install && npm run build

# Apple Messages
cd ../messages && npm install && npm run build

# Apple Contacts
cd ../contacts && npm install && npm run build
```

Then configure your MCP client to run the built files directly:

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "node",
      "args": ["/absolute/path/to/notes/build/index.js"]
    },
    "apple-messages": {
      "command": "node",
      "args": ["/absolute/path/to/messages/build/index.js"]
    },
    "apple-contacts": {
      "command": "node",
      "args": ["/absolute/path/to/contacts/build/index.js"]
    }
  }
}
```

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

## Apple Contacts

An MCP server that interacts with Apple Contacts via AppleScript.

### Tools

| Tool | Description |
|------|-------------|
| `list_groups` | List all groups in Apple Contacts |
| `list_contacts` | List all contacts, optionally filtered by group |
| `get_contact` | Get full details of a contact (emails, phones, addresses, etc.) |
| `search_contacts` | Search contacts by name |
| `create_contact` | Create a new contact with optional email, phone, organization |
| `delete_contact` | Delete a contact by name |
| `create_group` | Create a new group |
| `add_contact_to_group` | Add a contact to a group |

### Usage Examples

- "List all my contacts"
- "Find contacts named John"
- "Get details for Jane Smith"
- "Create a contact for Bob Jones at Acme Corp"

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
