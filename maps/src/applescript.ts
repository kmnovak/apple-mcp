import { execFile } from "node:child_process";

export function sanitize(input: string): string {
  return input
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r\n/g, "\\n")
    .replace(/\r/g, "\\n")
    .replace(/\n/g, "\\n");
}

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

function openUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("open", [url], (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`Failed to open URL: ${stderr || error.message}`));
        return;
      }
      resolve("OK");
    });
  });
}

export async function searchLocation(query: string): Promise<string> {
  const encoded = encodeURIComponent(query);
  const url = `maps://?q=${encoded}`;
  await openUrl(url);
  return `Opened Apple Maps and searched for: ${query}`;
}

export async function getDirections(
  from: string,
  to: string,
  transportType?: "driving" | "walking" | "transit"
): Promise<string> {
  const params = new URLSearchParams();
  params.set("saddr", from);
  params.set("daddr", to);
  if (transportType) {
    const typeMap: Record<string, string> = { driving: "d", walking: "w", transit: "r" };
    params.set("dirflg", typeMap[transportType] || "d");
  }
  const url = `maps://?${params.toString()}`;
  await openUrl(url);
  return `Opened Apple Maps with directions from "${from}" to "${to}"${transportType ? ` (${transportType})` : ""}`;
}

export async function dropPin(latitude: number, longitude: number, label?: string): Promise<string> {
  const params = new URLSearchParams();
  params.set("ll", `${latitude},${longitude}`);
  if (label) {
    params.set("q", label);
  }
  const url = `maps://?${params.toString()}`;
  await openUrl(url);
  return `Opened Apple Maps at ${latitude}, ${longitude}${label ? ` (${label})` : ""}`;
}

export async function openAddress(address: string): Promise<string> {
  const encoded = encodeURIComponent(address);
  const url = `maps://?address=${encoded}`;
  await openUrl(url);
  return `Opened Apple Maps at address: ${address}`;
}

export async function saveToFavorites(name: string, address: string): Promise<string> {
  const safeName = sanitize(name);
  const safeAddress = sanitize(address);
  // Apple Maps doesn't directly support adding favorites via AppleScript,
  // so we search for the location which allows the user to save it
  const encoded = encodeURIComponent(address);
  const url = `maps://?q=${encoded}`;
  await openUrl(url);
  return `Opened "${safeAddress}" in Apple Maps — you can save it as "${safeName}" from the Maps interface`;
}
