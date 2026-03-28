import { execFile } from "node:child_process";

/**
 * Escape a string for safe embedding inside an AppleScript double-quoted string.
 * Handles backslashes, double quotes, and other characters that AppleScript
 * interprets specially.
 */
export function sanitize(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n");
}

/**
 * Execute an AppleScript string via osascript and return stdout.
 */
export function runAppleScript(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`AppleScript error: ${stderr || error.message}`));
        return;
      }
      resolve(stdout.trimEnd());
    });
  });
}

/**
 * Find a chat by its database chat_identifier, falling back to participant handle matching.
 *
 * The AppleScript `chat.id` property does not always match the SQLite chat_identifier,
 * so we try two passes:
 *   1. Exact id match (handles group chats and cases where formats align)
 *   2. Participant handle match — strips any "service;type;" prefix from the chatId to get
 *      the bare phone/email, then looks for a 1:1 chat where a participant's id matches.
 *
 * Returns an AppleScript snippet (no surrounding tell block) that sets `foundChat`.
 */
function findChatScript(safeChatId: string, safeHandle: string): string {
  return `
  set foundChat to missing value
  repeat with c in (every chat)
    if (id of c) = "${safeChatId}" then
      set foundChat to c
      exit repeat
    end if
  end repeat
  if foundChat is missing value then
    repeat with c in (every chat)
      try
        repeat with p in (participants of c)
          if (id of p) = "${safeHandle}" then
            set foundChat to c
            exit repeat
          end if
        end repeat
      end try
      if foundChat is not missing value then exit repeat
    end repeat
  end if
  if foundChat is missing value then
    error "Chat not found: ${safeChatId}"
  end if`;
}

/**
 * Mark a Messages thread as read by opening it via AppleScript.
 * @param chatId - chat identifier (e.g. iMessage;-;+1234567890 or +1234567890)
 */
export async function markThreadAsRead(chatId: string): Promise<string> {
  const safeChatId = sanitize(chatId);
  // Strip "service;type;" prefix to get the bare handle for participant fallback
  // e.g. "iMessage;-;+1234567890" → "+1234567890", "+1234567890" → "+1234567890"
  const handle = chatId.includes(";") ? chatId.split(";").pop()! : chatId;
  const safeHandle = sanitize(handle);
  const script = `
tell application "Messages"
  activate
  ${findChatScript(safeChatId, safeHandle)}
  open foundChat
end tell
return "Marked chat ${safeChatId} as read"`;
  return runAppleScript(script);
}

/**
 * Delete a Messages thread via AppleScript.
 * @param chatId - chat identifier (e.g. iMessage;-;+1234567890 or +1234567890)
 */
export async function deleteThread(chatId: string): Promise<string> {
  const safeChatId = sanitize(chatId);
  const handle = chatId.includes(";") ? chatId.split(";").pop()! : chatId;
  const safeHandle = sanitize(handle);
  const script = `
tell application "Messages"
  ${findChatScript(safeChatId, safeHandle)}
  delete foundChat
end tell
return "Deleted chat ${safeChatId}"`;
  return runAppleScript(script);
}

/**
 * Send a message via Apple Messages using AppleScript.
 * @param to - phone number or email address of the recipient
 * @param text - message text to send
 * @param service - "iMessage" or "SMS" (defaults to "iMessage")
 */
export async function sendMessage(to: string, text: string, service: "iMessage" | "SMS" = "iMessage"): Promise<string> {
  const safeTo = sanitize(to);
  const safeText = sanitize(text);
  const serviceType = service === "SMS" ? "SMS" : "iMessage";
  const script = `
tell application "Messages"
  set targetService to 1st service whose service type = ${serviceType}
  set targetBuddy to buddy "${safeTo}" of targetService
  send "${safeText}" to targetBuddy
end tell
return "Message sent to ${safeTo}"`;
  return runAppleScript(script);
}
