#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import * as applescript from "./applescript.js";

function buildServer(): McpServer {
const server = new McpServer({
  name: "apple-mail",
  version: "1.0.0",
});

// ---- list_mailboxes ----
server.registerTool(
  "list_mailboxes",
  {
    description: "List all mailboxes across all accounts with unread counts",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const mailboxes = await applescript.listMailboxes();
      return { content: [{ type: "text", text: JSON.stringify(mailboxes, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- list_messages ----
server.registerTool(
  "list_messages",
  {
    description: "List recent messages in a mailbox, optionally filtered to unread only",
    inputSchema: z.object({
      mailbox: z.string().describe("Name of the mailbox (e.g. 'INBOX')"),
      account: z.string().describe("Name of the email account"),
      limit: z.number().optional().describe("Maximum number of messages to return (default 25)"),
      unread_only: z.boolean().optional().describe("When true, only return unread messages"),
    }),
  },
  async ({ mailbox, account, limit, unread_only }) => {
    try {
      const messages = await applescript.listMessages(mailbox, account, limit, unread_only);
      return { content: [{ type: "text", text: JSON.stringify(messages, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- get_message ----
server.registerTool(
  "get_message",
  {
    description: "Get the full content of an email message by ID",
    inputSchema: z.object({
      mailbox: z.string().describe("Name of the mailbox"),
      account: z.string().describe("Name of the email account"),
      message_id: z.number().describe("ID of the message to retrieve"),
    }),
  },
  async ({ mailbox, account, message_id }) => {
    try {
      const message = await applescript.getMessage(mailbox, account, message_id);
      return { content: [{ type: "text", text: JSON.stringify(message, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- search_messages ----
server.registerTool(
  "search_messages",
  {
    description: "Search emails by subject or sender across mailboxes",
    inputSchema: z.object({
      query: z.string().describe("Text to search for in email subjects or sender"),
      mailbox: z.string().optional().describe("Mailbox to search in (searches all if omitted)"),
      account: z.string().optional().describe("Account to search in (required if mailbox is specified)"),
      limit: z.number().optional().describe("Maximum number of results (default 25)"),
      search_field: z.enum(["subject", "sender"]).optional().describe("Field to search: 'subject' (default) or 'sender'"),
    }),
  },
  async ({ query, mailbox, account, limit, search_field }) => {
    try {
      const results = await applescript.searchMessages(query, mailbox, account, limit, search_field);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- send_email ----
server.registerTool(
  "send_email",
  {
    description: "Send an email via Apple Mail",
    inputSchema: z.object({
      to: z.string().describe("Recipient email address (comma-separated for multiple recipients)"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body text"),
      cc: z.string().optional().describe("CC recipient email address (comma-separated for multiple)"),
      bcc: z.string().optional().describe("BCC recipient email address (comma-separated for multiple)"),
      from_account: z.string().optional().describe("Account to send from (uses default if omitted)"),
    }),
  },
  async ({ to, subject, body, cc, bcc, from_account }) => {
    try {
      const result = await applescript.sendEmail(to, subject, body, {
        cc,
        bcc,
        from: from_account,
      });
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- get_unread_count ----
server.registerTool(
  "get_unread_count",
  {
    description: "Get the unread email count for a mailbox or across all mailboxes",
    inputSchema: z.object({
      mailbox: z.string().optional().describe("Mailbox name (returns total across all if omitted)"),
      account: z.string().optional().describe("Account name (required if mailbox is specified)"),
    }),
  },
  async ({ mailbox, account }) => {
    try {
      const count = await applescript.getUnreadCount(mailbox, account);
      return { content: [{ type: "text", text: JSON.stringify({ unread_count: count }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- move_message ----
server.registerTool(
  "move_message",
  {
    description: "Move an email message to a different mailbox",
    inputSchema: z.object({
      message_id: z.number().describe("ID of the message to move"),
      from_mailbox: z.string().describe("Source mailbox name"),
      from_account: z.string().describe("Source account name"),
      to_mailbox: z.string().describe("Destination mailbox name"),
      to_account: z.string().optional().describe("Destination account (same as source if omitted)"),
    }),
  },
  async ({ message_id, from_mailbox, from_account, to_mailbox, to_account }) => {
    try {
      const result = await applescript.moveMessage(message_id, from_mailbox, from_account, to_mailbox, to_account);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- mark_read ----
server.registerTool(
  "mark_read",
  {
    description: "Mark an email message as read or unread",
    inputSchema: z.object({
      message_id: z.number().describe("ID of the message"),
      mailbox: z.string().describe("Mailbox the message is in"),
      account: z.string().describe("Account the mailbox belongs to"),
      read: z.boolean().describe("True to mark as read, false to mark as unread"),
    }),
  },
  async ({ message_id, mailbox, account, read }) => {
    try {
      const result = await applescript.markRead(message_id, mailbox, account, read);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- delete_message ----
server.registerTool(
  "delete_message",
  {
    description: "Delete an email message (moves to trash)",
    inputSchema: z.object({
      message_id: z.number().describe("ID of the message to delete"),
      mailbox: z.string().describe("Mailbox the message is in"),
      account: z.string().describe("Account the mailbox belongs to"),
    }),
  },
  async ({ message_id, mailbox, account }) => {
    try {
      const result = await applescript.deleteMessage(message_id, mailbox, account);
      return { content: [{ type: "text", text: result }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
    }
  }
);

// ---- flag_message ----
server.registerTool(
  "flag_message",
  {
    description: "Flag or unflag an email message",
    inputSchema: z.object({
      message_id: z.number().describe("ID of the message to flag/unflag"),
      mailbox: z.string().describe("Mailbox the message is in"),
      account: z.string().describe("Account the mailbox belongs to"),
      flagged: z.boolean().describe("True to flag, false to unflag"),
    }),
  },
  async ({ message_id, mailbox, account, flagged }) => {
    try {
      const result = await applescript.flagMessage(message_id, mailbox, account, flagged);
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
      console.error(`Apple Mail MCP server listening on port ${port}`)
    );
  } else {
    const transport = new StdioServerTransport();
    await buildServer().connect(transport);
    console.error("Apple Mail MCP server running on stdio");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
