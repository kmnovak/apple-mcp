# @griches/apple-maps-mcp

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants access to Apple Maps on macOS using Maps URL schemes.

## Quick Start

```bash
npx @griches/apple-maps-mcp
```

## Tools

| Tool | Description |
|------|-------------|
| `search_location` | Search for a location in Apple Maps |
| `get_directions` | Get directions between two locations (driving, walking, or transit) |
| `drop_pin` | Drop a pin at specific coordinates |
| `open_address` | Open a specific address in Apple Maps |
| `save_to_favorites` | Open a location in Maps so you can save it as a favorite |

## Configuration

### Claude Code

```bash
claude mcp add apple-maps -- npx @griches/apple-maps-mcp
```

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apple-maps": {
      "command": "npx",
      "args": ["@griches/apple-maps-mcp"]
    }
  }
}
```

## Requirements

- **macOS** (uses Maps URL schemes)
- **Node.js** 18+

## License

MIT — see the [main repository](https://github.com/griches/apple-mcp) for full details.
