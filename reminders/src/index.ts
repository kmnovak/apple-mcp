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
  name: "apple-reminders",
  version: "1.0.0",
});

// ---- list_lists ----
server.registerTool(
  "list_lists",
  {
    description: "List all reminder lists in Apple Reminders",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const lists = await applescript.listLists();
      return { content: [{ type: "text", text: JSON.stringify(lists, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- create_list ----
server.registerTool(
  "create_list",
  {
    description: "Create a new reminder list",
    inputSchema: z.object({
      name: z.string().describe("Name of the list to create"),
    }),
  },
  async ({ name }) => {
    try {
      const result = await applescript.createList(name);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- list_reminders ----
server.registerTool(
  "list_reminders",
  {
    description: "List reminders in a specific list",
    inputSchema: z.object({
      list: z.string().describe("Name of the reminder list"),
      include_completed: z.boolean().optional().describe("Include completed reminders (default false)"),
    }),
  },
  async ({ list, include_completed }) => {
    try {
      const reminders = await applescript.listReminders(list, include_completed);
      return { content: [{ type: "text", text: JSON.stringify(reminders, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- get_reminder ----
server.registerTool(
  "get_reminder",
  {
    description: "Get full details of a reminder by name",
    inputSchema: z.object({
      name: z.string().describe("Name of the reminder to retrieve"),
      list: z.string().optional().describe("List to search in (searches all lists if omitted)"),
    }),
  },
  async ({ name, list }) => {
    try {
      const reminder = await applescript.getReminder(name, list);
      return { content: [{ type: "text", text: JSON.stringify(reminder, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- create_reminder ----
server.registerTool(
  "create_reminder",
  {
    description: "Create a new reminder in a list",
    inputSchema: z.object({
      name: z.string().describe("Name of the reminder"),
      list: z.string().describe("List to add the reminder to"),
      body: z.string().optional().describe("Notes/body text for the reminder"),
      due_date: z.string().optional().describe("Due date (e.g. 'March 15, 2025 at 2:00 PM')"),
      priority: z.number().optional().describe("Priority: 0 (none), 1 (high), 5 (medium), 9 (low)"),
    }),
  },
  async ({ name, list, body, due_date, priority }) => {
    try {
      const result = await applescript.createReminder(name, list, { body, dueDate: due_date, priority });
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- update_reminder ----
server.registerTool(
  "update_reminder",
  {
    description: "Update an existing reminder's details",
    inputSchema: z.object({
      name: z.string().describe("Name of the reminder to update"),
      list: z.string().optional().describe("List the reminder is in (searches all lists if omitted)"),
      new_name: z.string().optional().describe("New name for the reminder"),
      body: z.string().optional().describe("New notes/body text"),
      due_date: z.string().optional().describe("New due date (e.g. 'March 15, 2025 at 2:00 PM')"),
      priority: z.number().optional().describe("New priority: 0 (none), 1 (high), 5 (medium), 9 (low)"),
    }),
  },
  async ({ name, list, new_name, body, due_date, priority }) => {
    try {
      const result = await applescript.updateReminder(name, list, {
        newName: new_name,
        body,
        dueDate: due_date,
        priority,
      });
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- complete_reminder ----
server.registerTool(
  "complete_reminder",
  {
    description: "Mark a reminder as completed",
    inputSchema: z.object({
      name: z.string().describe("Name of the reminder to complete"),
      list: z.string().optional().describe("List the reminder is in (searches all lists if omitted)"),
    }),
  },
  async ({ name, list }) => {
    try {
      const result = await applescript.completeReminder(name, list);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- uncomplete_reminder ----
server.registerTool(
  "uncomplete_reminder",
  {
    description: "Mark a completed reminder as incomplete",
    inputSchema: z.object({
      name: z.string().describe("Name of the reminder to uncomplete"),
      list: z.string().optional().describe("List the reminder is in (searches all lists if omitted)"),
    }),
  },
  async ({ name, list }) => {
    try {
      const result = await applescript.uncompleteReminder(name, list);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

if (!readOnly) {
  // ---- delete_reminder ----
  server.registerTool(
    "delete_reminder",
    {
      description: "Delete a reminder",
      inputSchema: z.object({
        name: z.string().describe("Name of the reminder to delete"),
        list: z.string().optional().describe("List the reminder is in (searches all lists if omitted)"),
        ...(confirmDestructive ? { confirm: z.boolean().optional().describe("Set to true to confirm this destructive action") } : {}),
      }),
    },
    async ({ name, list, confirm }: { name: string; list?: string; confirm?: unknown }) => {
      if (confirmDestructive && !confirm) {
        return { content: [{ type: "text", text: "This will permanently delete the reminder. Please confirm with the user, then call again with confirm: true." }] };
      }
      try {
        const result = await applescript.deleteReminder(name, list);
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---- delete_list ----
  server.registerTool(
    "delete_list",
    {
      description: "Delete a reminder list and all its reminders",
      inputSchema: z.object({
        name: z.string().describe("Name of the list to delete"),
        ...(confirmDestructive ? { confirm: z.boolean().optional().describe("Set to true to confirm this destructive action") } : {}),
      }),
    },
    async ({ name, confirm }: { name: string; confirm?: unknown }) => {
      if (confirmDestructive && !confirm) {
        return { content: [{ type: "text", text: "This will permanently delete the reminder list and all its reminders. Please confirm with the user, then call again with confirm: true." }] };
      }
      try {
        const result = await applescript.deleteList(name);
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );
}

// ---- search_reminders ----
server.registerTool(
  "search_reminders",
  {
    description: "Search reminders by name across all lists or within a specific list",
    inputSchema: z.object({
      query: z.string().describe("Text to search for in reminder names"),
      list: z.string().optional().describe("List to search in (searches all lists if omitted)"),
    }),
  },
  async ({ query, list }) => {
    try {
      const results = await applescript.searchReminders(query, list);
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
      console.error(`Apple Reminders MCP server listening on port ${port}`)
    );
  } else {
    const transport = new StdioServerTransport();
    await buildServer().connect(transport);
    console.error("Apple Reminders MCP server running on stdio");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
