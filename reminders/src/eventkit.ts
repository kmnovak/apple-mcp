import { execFile } from "node:child_process";
import { join } from "node:path";

const BINARY = join(__dirname, "reminders-helper");

function runHelper(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(BINARY, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        try {
          const parsed = JSON.parse(stdout);
          if (parsed.error) {
            reject(new Error(parsed.error));
            return;
          }
        } catch {}
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Convert a human-readable date string to ISO 8601 for the Swift helper.
 * Handles: "March 9, 2026", "9 March 2026", "2026-03-09",
 * "March 15, 2025 at 2:00 PM", "Monday, 9 March 2026", etc.
 */
function dateToISO(input: string): string {
  const cleaned = input.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, "");
  let hours = 0, minutes = 0;
  const timeMatch = cleaned.match(/\bat\s+(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (timeMatch) {
    hours = parseInt(timeMatch[1]);
    minutes = parseInt(timeMatch[2]);
    if (timeMatch[3]?.toUpperCase() === "PM" && hours < 12) hours += 12;
    if (timeMatch[3]?.toUpperCase() === "AM" && hours === 12) hours = 0;
  }
  const dateOnly = cleaned.replace(/\s*\bat\s+\d{1,2}:\d{2}\s*(AM|PM)?/i, "").trim();
  const parsed = new Date(dateOnly);
  if (isNaN(parsed.getTime())) throw new Error(`Invalid date: "${input}"`);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return `${year}-${month}-${day}T${hh}:${mm}:00`;
}

export async function listLists(): Promise<{ name: string; id: string }[]> {
  const raw = await runHelper(["list-lists"]);
  return JSON.parse(raw);
}

export async function listReminders(
  listName: string,
  includeCompleted?: boolean
): Promise<{ name: string; id: string; completed: boolean; dueDate: string | null; priority: number }[]> {
  const args = ["list-reminders", "--list", listName];
  if (includeCompleted) args.push("--include-completed");
  const raw = await runHelper(args);
  return JSON.parse(raw);
}

export async function getReminder(name: string, listName?: string): Promise<{
  name: string;
  id: string;
  completed: boolean;
  dueDate: string | null;
  body: string | null;
  priority: number;
  list: string;
}> {
  const args = ["get-reminder", "--name", name];
  if (listName) args.push("--list", listName);
  const raw = await runHelper(args);
  return JSON.parse(raw);
}

export async function searchReminders(
  query: string,
  listName?: string
): Promise<{ name: string; id: string; list: string; completed: boolean }[]> {
  const args = ["search-reminders", "--query", query];
  if (listName) args.push("--list", listName);
  const raw = await runHelper(args);
  return JSON.parse(raw);
}

export async function completeReminder(name: string, listName?: string): Promise<string> {
  const args = ["complete-reminder", "--name", name];
  if (listName) args.push("--list", listName);
  const raw = await runHelper(args);
  return JSON.parse(raw);
}

export async function uncompleteReminder(name: string, listName?: string): Promise<string> {
  const args = ["uncomplete-reminder", "--name", name];
  if (listName) args.push("--list", listName);
  const raw = await runHelper(args);
  return JSON.parse(raw);
}

export async function createList(name: string): Promise<string> {
  const raw = await runHelper(["create-list", "--name", name]);
  return JSON.parse(raw);
}

export async function deleteList(name: string): Promise<string> {
  const raw = await runHelper(["delete-list", "--name", name]);
  return JSON.parse(raw);
}

export async function createReminder(
  name: string,
  listName: string,
  options?: { body?: string; dueDate?: string; priority?: number }
): Promise<string> {
  const args = ["create-reminder", "--name", name, "--list", listName];
  if (options?.body) args.push("--body", options.body);
  if (options?.dueDate) args.push("--due-date", dateToISO(options.dueDate));
  if (options?.priority !== undefined) args.push("--priority", String(options.priority));
  const raw = await runHelper(args);
  return JSON.parse(raw);
}

export async function deleteReminder(name: string, listName?: string): Promise<string> {
  const args = ["delete-reminder", "--name", name];
  if (listName) args.push("--list", listName);
  const raw = await runHelper(args);
  return JSON.parse(raw);
}

export async function updateReminder(
  name: string,
  listName: string | undefined,
  updates: { newName?: string; body?: string; dueDate?: string; priority?: number }
): Promise<string> {
  const args = ["update-reminder", "--name", name];
  if (listName) args.push("--list", listName);
  if (updates.newName) args.push("--new-name", updates.newName);
  if (updates.body) args.push("--body", updates.body);
  if (updates.dueDate) args.push("--due-date", dateToISO(updates.dueDate));
  if (updates.priority !== undefined) args.push("--priority", String(updates.priority));
  const raw = await runHelper(args);
  return JSON.parse(raw);
}
