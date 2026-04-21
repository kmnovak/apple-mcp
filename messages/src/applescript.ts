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
 * Find a chat by its database chat_identifier, trying multiple service prefixes
 * before falling back to participant handle matching.
 *
 * Pass 1: tries the exact id, then SMS;-;, iMessage;-;, and any;-; prefixed forms.
 *   macOS may register a chat as any;-;+1234567890 even when the SQLite
 *   chat_identifier is just +1234567890.
 * Pass 2: participant handle match — last resort for edge cases; may silently
 *   fail for SMS chats on macOS Ventura+ if `participants of c` throws.
 *
 * Returns an AppleScript snippet (no surrounding tell block) that sets `foundChat`.
 */
function findChatScript(safeChatId: string, safeHandle: string): string {
  return `
  set foundChat to missing value
  try
    set foundChat to first chat whose id = "${safeChatId}"
  end try
  if foundChat is missing value then
    try
      set foundChat to first chat whose id = "SMS;-;${safeHandle}"
    end try
  end if
  if foundChat is missing value then
    try
      set foundChat to first chat whose id = "iMessage;-;${safeHandle}"
    end try
  end if
  if foundChat is missing value then
    try
      set foundChat to first chat whose id = "any;-;${safeHandle}"
    end try
  end if
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
 * Mark a Messages thread as read via AppleScript.
 *
 * The Messages AppleScript dictionary (sdef) does not expose a "mark as read"
 * command or "unread count" property. The only mechanism available is to
 * activate the Messages app and bring the target chat into focus — the OS marks
 * it as read when the chat window becomes active, exactly as it does for a user.
 *
 * Direct SQLite writes to chat.db do not work: IMDPersistenceAgent holds
 * exclusive WAL locks on chat.db-wal / chat.db-shm and reverts external writes.
 *
 * @param chatId - chat identifier (e.g. iMessage;-;+1234567890 or +1234567890)
 * @returns confirmation string
 */
export async function markChatAsRead(chatId: string): Promise<string> {
  const handle = chatId.includes(";") ? chatId.split(";").pop()! : chatId;
  const safeHandle = sanitize(handle);
  // Open the chat via the messages:// URL scheme. This focuses the conversation
  // in the Messages app, which causes imagent to mark all messages as read —
  // the same action that happens when a user clicks on a chat.
  // This is the only reliable mechanism: the Messages sdef exposes no mark-as-read
  // command, and direct SQLite writes are reverted by IMDPersistenceAgent's WAL locks.
  const script = `
tell application "Messages" to activate
open location "messages://${safeHandle}"
return "Opened chat for ${safeHandle} in Messages to mark it as read"`;
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
