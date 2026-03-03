# @griches/apple-contacts-mcp

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access to Apple Contacts on macOS via AppleScript.

## Quick Start

```bash
npx @griches/apple-contacts-mcp
```

## Tools

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

## Configuration

### Claude Code

```bash
claude mcp add apple-contacts -- npx @griches/apple-contacts-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-contacts": {
      "command": "npx",
      "args": ["@griches/apple-contacts-mcp"]
    }
  }
}
```

## Requirements

- **macOS** (uses AppleScript)
- **Node.js** 18+

## License

MIT — see the [main repository](https://github.com/griches/apple-mcp) for full details.
