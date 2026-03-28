#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import * as applescript from "./applescript.js";
import * as database from "./database.js";

function buildServer(): McpServer {
  const server = new McpServer({
    name: "apple-messages",
    version: "1.0.0",
  });

  // ---- list_chats ----
  server.registerTool(
    "list_chats",
    {
      description: "List recent chats with last message preview and participant info",
      inputSchema: z.object({
        limit: z.number().optional().describe("Maximum number of chats to return (default 50)"),
      }),
    },
    async ({ limit }) => {
      try {
        const chats = database.listChats(limit);
        return { content: [{ type: "text", text: JSON.stringify(chats, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---- get_chat_messages ----
  server.registerTool(
    "get_chat_messages",
    {
      description: "Get message history for a specific chat",
      inputSchema: z.object({
        chat_id: z.string().describe("Chat identifier (e.g. iMessage;-;+1234567890)"),
        limit: z.number().optional().describe("Maximum number of messages to return (default 100)"),
        from_date: z.string().optional().describe("Filter messages from this date (e.g. '2025-01-01' or '2025-03-15T14:00:00')"),
        to_date: z.string().optional().describe("Filter messages up to this date (e.g. '2025-12-31')"),
      }),
    },
    async ({ chat_id, limit, from_date, to_date }) => {
      try {
        const messages = database.getChatMessages(chat_id, limit, from_date, to_date);
        return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---- search_messages ----
  server.registerTool(
    "search_messages",
    {
      description: "Search messages by text content",
      inputSchema: z.object({
        query: z.string().describe("Text to search for in messages"),
        chat_id: z.string().optional().describe("Limit search to a specific chat"),
        limit: z.number().optional().describe("Maximum number of results (default 50)"),
      }),
    },
    async ({ query, chat_id, limit }) => {
      try {
        const results = database.searchMessages(query, chat_id, limit);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---- send_message ----
  server.registerTool(
    "send_message",
    {
      description: "Send an iMessage or SMS to a phone number or email address",
      inputSchema: z.object({
        to: z.string().describe("Phone number or email address of the recipient"),
        text: z.string().describe("Message text to send"),
        service: z.enum(["iMessage", "SMS"]).optional().describe("Service to use (default iMessage)"),
      }),
    },
    async ({ to, text, service }) => {
      try {
        const result = await applescript.sendMessage(to, text, service);
        return { content: [{ type: "text", text: result }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---- get_chat_participants ----
  server.registerTool(
    "get_chat_participants",
    {
      description: "Get participants of a chat",
      inputSchema: z.object({
        chat_id: z.string().describe("Chat identifier (e.g. iMessage;-;+1234567890)"),
      }),
    },
    async ({ chat_id }) => {
      try {
        const participants = database.getChatParticipants(chat_id);
        return { content: [{ type: "text", text: JSON.stringify(participants, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---- mark_thread_as_read ----
  server.registerTool(
    "mark_thread_as_read",
    {
      description: "Mark a Messages thread as read",
      inputSchema: z.object({
        chat_id: z.string().describe("Chat identifier (e.g. iMessage;-;+1234567890)"),
      }),
    },
    ({ chat_id }) => {
      try {
        const changes = database.markChatAsRead(chat_id);
        return { content: [{ type: "text", text: `Marked ${changes} message(s) as read in chat ${chat_id}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
      }
    }
  );

  // ---- delete_thread ----
  server.registerTool(
    "delete_thread",
    {
      description: "Delete a Messages thread. Requires confirm: true to proceed.",
      inputSchema: z.object({
        chat_id: z.string().describe("Chat identifier (e.g. iMessage;-;+1234567890)"),
        confirm: z.boolean().optional().describe("Must be true to confirm deletion"),
      }),
    },
    async ({ chat_id, confirm }) => {
      if (confirm !== true) {
        return {
          content: [{ type: "text", text: "Deletion requires confirm: true. This action is irreversible." }],
          isError: true,
        };
      }
      try {
        const result = await applescript.deleteThread(chat_id);
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
      console.error(`Apple Messages MCP server listening on port ${port}`)
    );
  } else {
    const transport = new StdioServerTransport();
    await buildServer().connect(transport);
    console.error("Apple Messages MCP server running on stdio");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
