#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as applescript from "./applescript.js";

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

// ---- Start server ----
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Apple Maps MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
