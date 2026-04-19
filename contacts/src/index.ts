#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import * as applescript from "./applescript.js";

const readOnly = process.argv.includes("--read-only");
const confirmDestructive = process.argv.includes("--confirm-destructive");

type ToolResponse = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => {
      if (typeof value === "string" && ["note"].includes(key)) {
        return [key, `<${value.length} chars>`];
      }
      return [key, value];
    })
  );
}

function serverLog(event: string, details: Record<string, unknown>): void {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    server: "apple-contacts",
    event,
    ...details,
  }));
}

function errorResponse(err: unknown): ToolResponse {
  return { content: [{ type: "text", text: `Error: ${(err as Error).message}` }], isError: true };
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
  name: "apple-contacts",
  version: "1.0.0",
});

// ---- list_groups ----
server.registerTool(
  "list_groups",
  {
    description: "List all groups in Apple Contacts",
    inputSchema: z.object({}),
  },
  async () => {
    return withToolLogging("list_groups", {}, "List all Apple Contacts groups", async () => {
      const groups = await applescript.listGroups();
      return { content: [{ type: "text", text: JSON.stringify(groups, null, 2) }] };
    });
  }
);

// ---- list_contacts ----
server.registerTool(
  "list_contacts",
  {
    description: "List all contacts, optionally filtered by group",
    inputSchema: z.object({
      group: z.string().optional().describe("Group name to filter contacts (lists all if omitted)"),
    }),
  },
  async ({ group }) => {
    return withToolLogging("list_contacts", { group }, group ? `List contacts in group ${group}` : "List all contacts", async () => {
      const contacts = await applescript.listContacts(group);
      return { content: [{ type: "text", text: JSON.stringify(contacts, null, 2) }] };
    });
  }
);

// ---- get_contact ----
server.registerTool(
  "get_contact",
  {
    description: "Get full details of a contact by name including emails, phones, organization, and addresses",
    inputSchema: z.object({
      name: z.string().describe("Full name of the contact to retrieve"),
    }),
  },
  async ({ name }) => {
    return withToolLogging("get_contact", { name }, `Get contact details for ${name}`, async () => {
      const contact = await applescript.getContact(name);
      return { content: [{ type: "text", text: JSON.stringify(contact, null, 2) }] };
    });
  }
);

// ---- search_contacts ----
server.registerTool(
  "search_contacts",
  {
    description: "Search contacts by name and return full contact cards including emails, phones, organization, and addresses",
    inputSchema: z.object({
      query: z.string().describe("Text to search for in contact names"),
    }),
  },
  async ({ query }) => {
    return withToolLogging("search_contacts", { query }, `Search contacts for "${query}"`, async () => {
      const results = await applescript.searchContacts(query);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    });
  }
);

// ---- find_contact_by_phone ----
server.registerTool(
  "find_contact_by_phone",
  {
    description: "Find contacts by phone number (partial match) and return full contact cards including emails, phones, organization, and addresses",
    inputSchema: z.object({
      phone: z.string().describe("Phone number or partial phone number to search for"),
    }),
  },
  async ({ phone }) => {
    return withToolLogging("find_contact_by_phone", { phone }, `Find contacts by phone ${phone}`, async () => {
      const results = await applescript.getContactByPhone(phone);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    });
  }
);

// ---- find_contact_by_email ----
server.registerTool(
  "find_contact_by_email",
  {
    description: "Find contacts by email address (partial match) and return full contact cards including emails, phones, organization, and addresses",
    inputSchema: z.object({
      email: z.string().describe("Email address or partial email address to search for"),
    }),
  },
  async ({ email }) => {
    return withToolLogging("find_contact_by_email", { email }, `Find contacts by email ${email}`, async () => {
      const results = await applescript.getContactByEmail(email);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    });
  }
);

// ---- update_contact ----
server.registerTool(
  "update_contact",
  {
    description: "Update an existing contact's details. For email and phone, new entries are added (existing ones are not removed).",
    inputSchema: z.object({
      name: z.string().describe("Full name of the contact to update"),
      first_name: z.string().optional().describe("New first name"),
      last_name: z.string().optional().describe("New last name"),
      email: z.string().optional().describe("Email address to add"),
      phone: z.string().optional().describe("Phone number to add"),
      organization: z.string().optional().describe("New company or organization"),
      job_title: z.string().optional().describe("New job title"),
      note: z.string().optional().describe("New note"),
    }),
  },
  async ({ name, first_name, last_name, email, phone, organization, job_title, note }) => {
    return withToolLogging(
      "update_contact",
      { name, first_name, last_name, email, phone, organization, job_title, note },
      `Update contact ${name}`,
      async () => {
      const result = await applescript.updateContact(name, {
        firstName: first_name,
        lastName: last_name,
        email,
        phone,
        organization,
        jobTitle: job_title,
        note,
      });
      return { content: [{ type: "text", text: result }] };
      }
    );
  }
);

// ---- create_contact ----
server.registerTool(
  "create_contact",
  {
    description: "Create a new contact in Apple Contacts",
    inputSchema: z.object({
      first_name: z.string().describe("First name of the contact"),
      last_name: z.string().describe("Last name of the contact"),
      email: z.string().optional().describe("Email address"),
      phone: z.string().optional().describe("Phone number"),
      organization: z.string().optional().describe("Company or organization"),
      job_title: z.string().optional().describe("Job title"),
      note: z.string().optional().describe("Note about the contact"),
    }),
  },
  async ({ first_name, last_name, email, phone, organization, job_title, note }) => {
    return withToolLogging(
      "create_contact",
      { first_name, last_name, email, phone, organization, job_title, note },
      `Create contact ${first_name} ${last_name}`,
      async () => {
      const result = await applescript.createContact(first_name, last_name, {
        email,
        phone,
        organization,
        jobTitle: job_title,
        note,
      });
      return { content: [{ type: "text", text: result }] };
      }
    );
  }
);

if (!readOnly) {
  // ---- delete_contact ----
  server.registerTool(
    "delete_contact",
    {
      description: "Delete a contact by name",
      inputSchema: z.object({
        name: z.string().describe("Full name of the contact to delete"),
        ...(confirmDestructive ? { confirm: z.boolean().optional().describe("Set to true to confirm this destructive action") } : {}),
      }),
    },
    async ({ name, confirm }: { name: string; confirm?: unknown }) => {
      return withToolLogging("delete_contact", { name, confirm }, `Delete contact ${name}`, async () => {
        if (confirmDestructive && !confirm) {
          return { content: [{ type: "text", text: "This will permanently delete the contact. Please confirm with the user, then call again with confirm: true." }] };
        }
        const result = await applescript.deleteContact(name);
        return { content: [{ type: "text", text: result }] };
      });
    }
  );
}

// ---- create_group ----
server.registerTool(
  "create_group",
  {
    description: "Create a new group in Apple Contacts",
    inputSchema: z.object({
      name: z.string().describe("Name of the group to create"),
    }),
  },
  async ({ name }) => {
    return withToolLogging("create_group", { name }, `Create contact group ${name}`, async () => {
      const result = await applescript.createGroup(name);
      return { content: [{ type: "text", text: result }] };
    });
  }
);

// ---- add_contact_to_group ----
server.registerTool(
  "add_contact_to_group",
  {
    description: "Add an existing contact to a group",
    inputSchema: z.object({
      contact_name: z.string().describe("Full name of the contact"),
      group_name: z.string().describe("Name of the group to add the contact to"),
    }),
  },
  async ({ contact_name, group_name }) => {
    return withToolLogging(
      "add_contact_to_group",
      { contact_name, group_name },
      `Add contact ${contact_name} to group ${group_name}`,
      async () => {
      const result = await applescript.addContactToGroup(contact_name, group_name);
      return { content: [{ type: "text", text: result }] };
      }
    );
  }
);

// ---- remove_contact_from_group ----
server.registerTool(
  "remove_contact_from_group",
  {
    description: "Remove a contact from a group",
    inputSchema: z.object({
      contact_name: z.string().describe("Full name of the contact"),
      group_name: z.string().describe("Name of the group to remove the contact from"),
    }),
  },
  async ({ contact_name, group_name }) => {
    return withToolLogging(
      "remove_contact_from_group",
      { contact_name, group_name },
      `Remove contact ${contact_name} from group ${group_name}`,
      async () => {
      const result = await applescript.removeContactFromGroup(contact_name, group_name);
      return { content: [{ type: "text", text: result }] };
      }
    );
  }
);

if (!readOnly) {
  // ---- delete_group ----
  server.registerTool(
    "delete_group",
    {
      description: "Delete a contact group",
      inputSchema: z.object({
        name: z.string().describe("Name of the group to delete"),
        ...(confirmDestructive ? { confirm: z.boolean().optional().describe("Set to true to confirm this destructive action") } : {}),
      }),
    },
    async ({ name, confirm }: { name: string; confirm?: unknown }) => {
      return withToolLogging("delete_group", { name, confirm }, `Delete contact group ${name}`, async () => {
        if (confirmDestructive && !confirm) {
          return { content: [{ type: "text", text: "This will permanently delete the contact group. Please confirm with the user, then call again with confirm: true." }] };
        }
        const result = await applescript.deleteGroup(name);
        return { content: [{ type: "text", text: result }] };
      });
    }
  );
}

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
      console.error(`Apple Contacts MCP server listening on port ${port}`)
    );
  } else {
    const transport = new StdioServerTransport();
    await buildServer().connect(transport);
    console.error("Apple Contacts MCP server running on stdio");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
