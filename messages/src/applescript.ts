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
 * Mark a Messages thread as read by opening it via AppleScript.
 * Uses explicit iteration rather than a `whose` filter, which is unreliable
 * for chat collections in newer macOS versions.
 * @param chatId - chat identifier (e.g. iMessage;-;+1234567890)
 */
export async function markThreadAsRead(chatId: string): Promise<string> {
  const safeChatId = sanitize(chatId);
  const script = `
tell application "Messages"
  activate
  set foundChat to missing value
  repeat with c in (every chat)
    if (id of c) = "${safeChatId}" then
      set foundChat to c
      exit repeat
    end if
  end repeat
  if foundChat is missing value then
    error "Chat not found: ${safeChatId}"
  end if
  open foundChat
end tell
return "Marked chat ${safeChatId} as read"`;
  return runAppleScript(script);
}

/**
 * Delete a Messages thread via AppleScript.
 * Uses explicit iteration rather than a `whose` filter, which is unreliable
 * for chat collections in newer macOS versions.
 * @param chatId - chat identifier (e.g. iMessage;-;+1234567890)
 */
export async function deleteThread(chatId: string): Promise<string> {
  const safeChatId = sanitize(chatId);
  const script = `
tell application "Messages"
  set foundChat to missing value
  repeat with c in (every chat)
    if (id of c) = "${safeChatId}" then
      set foundChat to c
      exit repeat
    end if
  end repeat
  if foundChat is missing value then
    error "Chat not found: ${safeChatId}"
  end if
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
