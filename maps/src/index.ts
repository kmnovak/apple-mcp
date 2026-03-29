#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import * as applescript from "./applescript.js";

function buildServer(): McpServer {
const server = new McpServer({
  name: "apple-maps",
  version: "1.0.0",
});

// ---- search_location ----
server.registerTool(
  "search_location",
  {
    description: "Search for a location in Apple Maps",
    inputSchema: z.object({
      query: z.string().describe("Location to search for (e.g. 'coffee shops near me', 'Eiffel Tower')"),
    }),
  },
  async ({ query }) => {
    try {
      const result = await applescript.searchLocation(query);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- get_directions ----
server.registerTool(
  "get_directions",
  {
    description: "Get directions between two locations in Apple Maps",
    inputSchema: z.object({
      from: z.string().describe("Starting location (address, place name, or 'Current Location')"),
      to: z.string().describe("Destination (address or place name)"),
      transport_type: z
        .enum(["driving", "walking", "transit"])
        .optional()
        .describe("Transport type (default driving)"),
    }),
  },
  async ({ from, to, transport_type }) => {
    try {
      const result = await applescript.getDirections(from, to, transport_type);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- drop_pin ----
server.registerTool(
  "drop_pin",
  {
    description: "Drop a pin at specific coordinates in Apple Maps",
    inputSchema: z.object({
      latitude: z.number().describe("Latitude of the location"),
      longitude: z.number().describe("Longitude of the location"),
      label: z.string().optional().describe("Label for the pin"),
    }),
  },
  async ({ latitude, longitude, label }) => {
    try {
      const result = await applescript.dropPin(latitude, longitude, label);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- open_address ----
server.registerTool(
  "open_address",
  {
    description: "Open a specific address in Apple Maps",
    inputSchema: z.object({
      address: z.string().describe("Full address to open in Maps"),
    }),
  },
  async ({ address }) => {
    try {
      const result = await applescript.openAddress(address);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- save_to_favorites ----
server.registerTool(
  "save_to_favorites",
  {
    description: "Open a location in Apple Maps so you can save it as a favorite. (Maps opens the location — save it manually from the Maps interface.)",
    inputSchema: z.object({
      name: z.string().describe("Label/name for the favorite"),
      address: z.string().describe("Address or place name to open in Maps"),
    }),
  },
  async ({ name, address }) => {
    try {
      const result = await applescript.saveToFavorites(name, address);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

  return server;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve(undefined);
      }
    });
    req.on("error", reject);
  });
}

function checkAuth(req: IncomingMessage, authToken: string): boolean {
  const header = req.headers["authorization"] ?? "";
  return header === `Bearer ${authToken}`;
}

function send401(res: ServerResponse): void {
  res.writeHead(401, { "Content-Type": "application/json" })
    .end(JSON.stringify({ error: "Unauthorized" }));
}

// ---- Start server ----
async function main() {
  const portArg = process.argv.indexOf("--port");
  const port =
    portArg !== -1
      ? parseInt(process.argv[portArg + 1], 10)
      : process.env.PORT
        ? parseInt(process.env.PORT, 10)
        : null;

  const tokenArg = process.argv.indexOf("--auth-token");
  const authToken =
    tokenArg !== -1
      ? process.argv[tokenArg + 1]
      : (process.env.MCP_AUTH_TOKEN ?? null);

  if (port !== null) {
    if (!authToken) {
      console.error("Error: --auth-token or MCP_AUTH_TOKEN is required in HTTP mode");
      process.exit(1);
    }

    const httpServer = createServer(async (req, res) => {
      if (!checkAuth(req, authToken)) {
        send401(res);
        return;
      }
      if (req.url === "/mcp" && req.method === "POST") {
        req.headers["accept"] = "application/json, text/event-stream";
        const body = await readBody(req);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        const mcpServer = buildServer();
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, body);
        res.on("finish", () => transport.close());
      } else {
        res.writeHead(404).end();
      }
    });

    httpServer.listen(port, () =>
      console.error(`Apple Maps MCP server listening on port ${port}`)
    );
  } else {
    const transport = new StdioServerTransport();
    await buildServer().connect(transport);
    console.error("Apple Maps MCP server running on stdio");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
