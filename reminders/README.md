# @griches/apple-reminders-mcp

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access to Apple Reminders on macOS via AppleScript.

## Quick Start

```bash
npx @griches/apple-reminders-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `list_lists` | List all reminder lists |
| `create_list` | Create a new reminder list |
| `list_reminders` | List reminders in a list (optionally include completed) |
| `get_reminder` | Get full details of a reminder by name |
| `create_reminder` | Create a new reminder with optional due date, notes, and priority |
| `update_reminder` | Update an existing reminder's details |
| `complete_reminder` | Mark a reminder as completed |
| `uncomplete_reminder` | Mark a completed reminder as incomplete |
| `delete_reminder` | Delete a reminder |
| `delete_list` | Delete a reminder list and all its reminders |
| `search_reminders` | Search reminders by name across lists |

## Configuration

### Claude Code

```bash
claude mcp add apple-reminders -- npx @griches/apple-reminders-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-reminders": {
      "command": "npx",
      "args": ["@griches/apple-reminders-mcp"]
    }
  }
}
```

## Requirements

- **macOS** (uses AppleScript)
- **Node.js** 18+

## License

MIT — see the [main repository](https://github.com/griches/apple-mcp) for full details.
