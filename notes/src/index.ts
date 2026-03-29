#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import * as applescript from "./applescript.js";

const readOnly = process.argv.includes("--read-only");
const confirmDestructive = process.argv.includes("--confirm-destructive");

function buildServer(): McpServer {
const server = new McpServer({
  name: "apple-notes",
  version: "1.0.0",
});

// ---- list_folders ----
server.registerTool(
  "list_folders",
  {
    description: "List all folders in Apple Notes",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const folders = await applescript.listFolders();
      return { content: [{ type: "text", text: JSON.stringify(folders, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- create_folder ----
server.registerTool(
  "create_folder",
  {
    description: "Create a new folder in Apple Notes",
    inputSchema: z.object({
      name: z.string().describe("Name of the folder to create"),
    }),
  },
  async ({ name }) => {
    try {
      const result = await applescript.createFolder(name);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- list_notes ----
server.registerTool(
  "list_notes",
  {
    description: "List all notes in a specified Apple Notes folder",
    inputSchema: z.object({
      folder: z.string().describe("Name of the folder to list notes from"),
    }),
  },
  async ({ folder }) => {
    try {
      const notes = await applescript.listNotes(folder);
      return { content: [{ type: "text", text: JSON.stringify(notes, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- get_note ----
server.registerTool(
  "get_note",
  {
    description: "Get the full content of a specific note by title",
    inputSchema: z.object({
      title: z.string().describe("Title of the note to retrieve"),
      folder: z.string().optional().describe("Folder to search in (searches all folders if omitted)"),
    }),
  },
  async ({ title, folder }) => {
    try {
      const note = await applescript.getNote(title, folder);
      return { content: [{ type: "text", text: JSON.stringify(note, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- create_note ----
server.registerTool(
  "create_note",
  {
    description: "Create a new note in a specified Apple Notes folder",
    inputSchema: z.object({
      title: z.string().describe("Title of the new note"),
      body: z.string().describe("HTML body content of the note"),
      folder: z.string().describe("Folder to create the note in"),
    }),
  },
  async ({ title, body, folder }) => {
    try {
      const result = await applescript.createNote(title, body, folder);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- update_note ----
server.registerTool(
  "update_note",
  {
    description: "Update the body of an existing note",
    inputSchema: z.object({
      title: z.string().describe("Title of the note to update"),
      body: z.string().describe("New HTML body content for the note"),
      folder: z.string().optional().describe("Folder the note is in (searches all folders if omitted)"),
    }),
  },
  async ({ title, body, folder }) => {
    try {
      const result = await applescript.updateNote(title, body, folder);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

if (!readOnly) {
  // ---- delete_note ----
  server.registerTool(
    "delete_note",
    {
      description: "Delete a note from Apple Notes",
      inputSchema: z.object({
        title: z.string().describe("Title of the note to delete"),
        folder: z.string().optional().describe("Folder the note is in (searches all folders if omitted)"),
        ...(confirmDestructive ? { confirm: z.boolean().optional().describe("Set to true to confirm this destructive action") } : {}),
      }),
    },
    async ({ title, folder, confirm }: { title: string; folder?: string; confirm?: unknown }) => {
      if (confirmDestructive && !confirm) {
        return { content: [{ type: "text", text: "This will permanently delete the note. Please confirm with the user, then call again with confirm: true." }] };
      }
      try {
        const result = await applescript.deleteNote(title, folder);
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---- delete_folder ----
  server.registerTool(
    "delete_folder",
    {
      description: "Delete a folder and all its notes from Apple Notes",
      inputSchema: z.object({
        name: z.string().describe("Name of the folder to delete"),
        ...(confirmDestructive ? { confirm: z.boolean().optional().describe("Set to true to confirm this destructive action") } : {}),
      }),
    },
    async ({ name, confirm }: { name: string; confirm?: unknown }) => {
      if (confirmDestructive && !confirm) {
        return { content: [{ type: "text", text: "This will permanently delete the folder and all notes inside it. Please confirm with the user, then call again with confirm: true." }] };
      }
      try {
        const result = await applescript.deleteFolder(name);
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );
}

// ---- move_note ----
server.registerTool(
  "move_note",
  {
    description: "Move a note from one folder to another",
    inputSchema: z.object({
      title: z.string().describe("Title of the note to move"),
      from_folder: z.string().describe("Source folder name"),
      to_folder: z.string().describe("Destination folder name"),
    }),
  },
  async ({ title, from_folder, to_folder }) => {
    try {
      const result = await applescript.moveNote(title, from_folder, to_folder);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- append_to_note ----
server.registerTool(
  "append_to_note",
  {
    description: "Append HTML content to an existing note without replacing its body",
    inputSchema: z.object({
      title: z.string().describe("Title of the note to append to"),
      content: z.string().describe("HTML content to append to the note"),
      folder: z.string().optional().describe("Folder the note is in (searches all folders if omitted)"),
    }),
  },
  async ({ title, content, folder }) => {
    try {
      const result = await applescript.appendToNote(title, content, folder);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- search_notes ----
server.registerTool(
  "search_notes",
  {
    description: "Search notes by keyword across all folders or within a specific folder. Searches both titles and body content.",
    inputSchema: z.object({
      query: z.string().describe("Search keyword to match against note titles and body content"),
      folder: z.string().optional().describe("Folder to search in (searches all folders if omitted)"),
    }),
  },
  async ({ query, folder }) => {
    try {
      const results = await applescript.searchNotes(query, folder);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
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
      console.error(`Apple Notes MCP server listening on port ${port}`)
    );
  } else {
    const transport = new StdioServerTransport();
    await buildServer().connect(transport);
    console.error("Apple Notes MCP server running on stdio");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
