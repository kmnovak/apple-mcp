import { describe, expect, test } from "bun:test";
import { deleteThread, messagesUrlForHandle, sanitize } from "../src/applescript.js";

describe("sanitize", () => {
  test("returns empty string unchanged", () => {
    expect(sanitize("")).toBe("");
  });

  test("escapes backslashes", () => {
    expect(sanitize("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  test("escapes double quotes", () => {
    expect(sanitize('say "hello"')).toBe('say \\"hello\\"');
  });

  test("converts newlines to AppleScript \\n", () => {
    expect(sanitize("line1\nline2")).toBe("line1\\nline2");
  });

  test("converts carriage returns to AppleScript \\n", () => {
    expect(sanitize("line1\rline2")).toBe("line1\\nline2");
  });

  test("converts CRLF to single AppleScript \\n", () => {
    expect(sanitize("line1\r\nline2")).toBe("line1\\nline2");
  });

  test("handles combined special characters", () => {
    expect(sanitize('He said "hello\\world"\nGoodbye')).toBe(
      'He said \\"hello\\\\world\\"\\nGoodbye'
    );
  });

  test("leaves plain text unchanged", () => {
    expect(sanitize("Hello world 123")).toBe("Hello world 123");
  });
});

describe("messagesUrlForHandle", () => {
  test("percent-encodes phone numbers so plus signs are not ambiguous", () => {
    expect(messagesUrlForHandle("+15551234567")).toBe("messages://%2B15551234567");
  });

  test("percent-encodes email handles", () => {
    expect(messagesUrlForHandle("person+test@example.com")).toBe("messages://person%2Btest%40example.com");
  });
});

describe("deleteThread", () => {
  test("fails closed instead of clicking the currently focused Messages thread", async () => {
    await expect(deleteThread("iMessage;-;+15551234567")).rejects.toThrow(
      "delete_thread is disabled"
    );
  });
});
