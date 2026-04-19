#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import * as applescript from "./applescript.js";
import * as database from "./database.js";

type ToolResponse = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => {
      if (typeof value === "string" && ["text"].includes(key)) {
        return [key, `<${value.length} chars>`];
      }
      return [key, value];
    })
  );
}

function serverLog(event: string, details: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    server: "apple-messages",
    event,
    ...details,
  }));
}

function errorResponse(err: unknown): ToolResponse {
  return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
}

const DEFAULT_MARK_READ_TIMEOUT_MS = 10000;
const MARK_READ_POLL_INTERVAL_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markReadOpenTarget(chat: database.ChatReadState): string {
  if (chat.participants.length === 1) {
    return chat.participants[0].handle_id;
  }
  return chat.chat_id;
}

async function waitForThreadToBeRead(chatId: string, timeoutMs: number): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let unreadCount = database.getChatReadState(chatId).unread_count;

  while (unreadCount > 0 && Date.now() < deadline) {
    await sleep(MARK_READ_POLL_INTERVAL_MS);
    unreadCount = database.getChatReadState(chatId).unread_count;
  }

  return unreadCount;
}

async function withToolLogging(
  tool: string,
  args: Record<string, unknown>,
  action: string,
  handler: () => ToolResponse | Promise<ToolResponse>
): Promise<ToolResponse> {
  const start = Date.now();
  serverLog("tool_call", { tool, action, args: summarizeArgs(args) });
  try {
    const response = await handler();
    serverLog("tool_result", {
      tool,
      status: response.isError ? "error" : "ok",
      duration_ms: Date.now() - start,
      ...(response.isError ? { error: response.content[0]?.text } : {}),
    });
    return response;
  } catch (err) {
    serverLog("tool_result", {
      tool,
      status: "error",
      duration_ms: Date.now() - start,
      error: (err as Error).message,
    });
    return errorResponse(err);
  }
}

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
      return withToolLogging("list_chats", { limit }, `List recent chats with limit ${limit ?? 50}`, () => {
        const chats = database.listChats(limit);
        return { content: [{ type: "text", text: JSON.stringify(chats, null, 2) }] };
      });
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
      return withToolLogging(
        "get_chat_messages",
        { chat_id, limit, from_date, to_date },
        `Get messages for chat ${chat_id}`,
        () => {
        const messages = database.getChatMessages(chat_id, limit, from_date, to_date);
        return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
        }
      );
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
      return withToolLogging("search_messages", { query, chat_id, limit }, `Search messages for "${query}"`, () => {
        const results = database.searchMessages(query, chat_id, limit);
        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      });
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
      return withToolLogging("send_message", { to, text, service }, `Send ${service ?? "iMessage"} message to ${to}`, async () => {
        const result = await applescript.sendMessage(to, text, service);
        return { content: [{ type: "text", text: result }] };
      });
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
      return withToolLogging("get_chat_participants", { chat_id }, `Get participants for chat ${chat_id}`, () => {
        const participants = database.getChatParticipants(chat_id);
        return { content: [{ type: "text", text: JSON.stringify(participants, null, 2) }] };
      });
    }
  );

  // ---- mark_thread_as_read ----
  server.registerTool(
    "mark_thread_as_read",
    {
      description: "Mark a Messages thread as read",
      inputSchema: z.object({
        chat_id: z.string().describe("Chat identifier (e.g. iMessage;-;+1234567890)"),
        timeout_ms: z.number().optional().describe("How long to wait for unread count verification (default 10000)"),
      }),
    },
    async ({ chat_id, timeout_ms }) => {
      return withToolLogging("mark_thread_as_read", { chat_id, timeout_ms }, `Open chat ${chat_id} in Messages and verify it becomes read`, async () => {
        const timeoutMs = Math.max(0, timeout_ms ?? DEFAULT_MARK_READ_TIMEOUT_MS);
        const before = database.getChatReadState(chat_id);
        if (before.unread_count === 0) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                status: "already_read",
                chat_id: before.chat_id,
                unread_before: 0,
                unread_after: 0,
              }, null, 2),
            }],
          };
        }

        const openTarget = markReadOpenTarget(before);
        await applescript.markChatAsRead(openTarget);
        const unreadAfter = await waitForThreadToBeRead(before.chat_id, timeoutMs);

        if (unreadAfter > 0) {
          return {
            content: [{
              type: "text",
              text: `Opened Messages target "${openTarget}", but chat "${before.chat_id}" still has ${unreadAfter} unread message(s) after ${timeoutMs}ms. The thread may not have focused correctly.`,
            }],
            isError: true,
          };
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "marked_read",
              chat_id: before.chat_id,
              opened_target: openTarget,
              unread_before: before.unread_count,
              unread_after: unreadAfter,
            }, null, 2),
          }],
        };
      });
    }
  );

  // ---- diagnose_db_write ----
  server.registerTool(
    "diagnose_db_write",
    {
      description: "Diagnostic: test whether chat.db is readable/writable from this process and whether DB writes persist",
      inputSchema: z.object({
        chat_id: z.string().describe("Chat identifier to test with (e.g. iMessage;-;+1234567890)"),
      }),
    },
    async ({ chat_id }) => {
      return withToolLogging("diagnose_db_write", { chat_id }, `Diagnose Messages database write behavior for chat ${chat_id}`, async () => {
      const { DatabaseSync } = await import("node:sqlite");
      const { homedir } = await import("node:os");
      const { join } = await import("node:path");
      const DB_PATH = join(homedir(), "Library", "Messages", "chat.db");
      const identifier = chat_id.includes(";") ? chat_id.split(";").pop()! : chat_id;
      const lines: string[] = [`DB_PATH: ${DB_PATH}`, `identifier: ${identifier}`];

      // Step 1: Read-only open
      try {
        const ro = new DatabaseSync(DB_PATH, { readOnly: true });
        const jm = ro.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
        lines.push(`[READ-ONLY] OK - journal_mode: ${jm.journal_mode}`);
        const before = ro.prepare(`SELECT COUNT(*) as cnt FROM message WHERE ROWID IN (SELECT message_id FROM chat_message_join WHERE chat_id = (SELECT ROWID FROM chat WHERE chat_identifier = ?)) AND is_from_me = 0 AND is_read = 0`).get(identifier) as { cnt: number };
        lines.push(`[READ-ONLY] unread_before: ${before.cnt}`);
        ro.close();
      } catch (e) {
        lines.push(`[READ-ONLY] FAILED: ${(e as Error).message}`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // Step 2: Read-write open + UPDATE
      let changes = 0;
      try {
        const rw = new DatabaseSync(DB_PATH);
        const jm = rw.prepare("PRAGMA journal_mode").get() as { journal_mode: string };
        lines.push(`[READ-WRITE] OK - journal_mode: ${jm.journal_mode}`);
        const bt = rw.prepare("PRAGMA busy_timeout").get() as { busy_timeout: number };
        lines.push(`[READ-WRITE] busy_timeout: ${bt.busy_timeout}`);
        rw.prepare("PRAGMA busy_timeout = 5000").run();
        const result = rw.prepare(`UPDATE message SET is_read = 1 WHERE ROWID IN (SELECT message_id FROM chat_message_join WHERE chat_id = (SELECT ROWID FROM chat WHERE chat_identifier = ?)) AND is_from_me = 0 AND is_read = 0`).run(identifier) as { changes: number };
        changes = result.changes;
        lines.push(`[READ-WRITE] UPDATE changes: ${changes}`);
        const after = rw.prepare(`SELECT COUNT(*) as cnt FROM message WHERE ROWID IN (SELECT message_id FROM chat_message_join WHERE chat_id = (SELECT ROWID FROM chat WHERE chat_identifier = ?)) AND is_from_me = 0 AND is_read = 0`).get(identifier) as { cnt: number };
        lines.push(`[READ-WRITE] unread_after_write (same conn): ${after.cnt}`);
        const ckpt = rw.prepare("PRAGMA wal_checkpoint(FULL)").get() as Record<string, unknown>;
        lines.push(`[READ-WRITE] wal_checkpoint(FULL): ${JSON.stringify(ckpt)}`);
        rw.close();
      } catch (e) {
        lines.push(`[READ-WRITE] FAILED: ${(e as Error).message}`);
      }

      // Step 3: Re-open read-only and verify persistence
      try {
        const verify = new DatabaseSync(DB_PATH, { readOnly: true });
        const afterClose = verify.prepare(`SELECT COUNT(*) as cnt FROM message WHERE ROWID IN (SELECT message_id FROM chat_message_join WHERE chat_id = (SELECT ROWID FROM chat WHERE chat_identifier = ?)) AND is_from_me = 0 AND is_read = 0`).get(identifier) as { cnt: number };
        lines.push(`[VERIFY] unread_after_close: ${afterClose.cnt}`);
        lines.push(`[VERDICT] Write ${changes > 0 ? "made changes" : "made no changes"}; persisted=${changes > 0 && afterClose.cnt === 0 ? "YES" : "NO or unknown"}`);
        verify.close();
      } catch (e) {
        lines.push(`[VERIFY] FAILED: ${(e as Error).message}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
      });
    }
  );

  // ---- delete_thread ----
  server.registerTool(
    "delete_thread",
    {
      description: "Disabled safety guard for deleting a Messages thread. Always fails closed because Messages UI automation cannot verify the focused conversation.",
      inputSchema: z.object({
        chat_id: z.string().describe("Chat identifier (e.g. iMessage;-;+1234567890)"),
        confirm: z.boolean().optional().describe("Must be true to confirm deletion"),
      }),
    },
    async ({ chat_id, confirm }) => {
      return withToolLogging("delete_thread", { chat_id, confirm }, `Delete Messages thread ${chat_id}`, async () => {
        if (confirm !== true) {
          return {
            content: [{ type: "text", text: "Deletion requires confirm: true. This action is irreversible." }],
            isError: true,
          };
        }
        const result = await applescript.deleteThread(chat_id);
        return { content: [{ type: "text", text: result }] };
      });
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
