import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

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

const FIELD_DELIM = "|||";
const RECORD_DELIM = "<<<>>>";

type ContactCard = {
  name: string;
  id: string;
  emails: string[];
  phones: string[];
  organization: string | null;
  jobTitle: string | null;
  note: string | null;
  addresses: string[];
};

let cachedDbPath: string | null = null;

async function findAddressBookDb(): Promise<string> {
  if (cachedDbPath) return cachedDbPath;
  const sourcesDir = join(homedir(), "Library", "Application Support", "AddressBook", "Sources");
  const entries = await readdir(sourcesDir);
  for (const entry of entries) {
    const candidate = join(sourcesDir, entry, "AddressBook-v22.abcddb");
    try {
      await readdir(join(sourcesDir, entry));
      cachedDbPath = candidate;
      return candidate;
    } catch {
      // skip
    }
  }
  throw new Error("AddressBook SQLite database not found");
}

function runSqlite(dbPath: string, sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile("sqlite3", ["-separator", "\x1f", dbPath], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`SQLite error: ${stderr || error.message}`));
        return;
      }
      resolve(stdout.trimEnd());
    });
    child.stdin!.end(sql);
  });
}

const CONTACT_CARD_SQL = `
SELECT
  r.ZUNIQUEID,
  coalesce(r.ZFIRSTNAME, '') || ' ' || coalesce(r.ZLASTNAME, ''),
  coalesce(r.ZORGANIZATION, ''),
  coalesce(r.ZJOBTITLE, ''),
  coalesce(group_concat(DISTINCT p.ZFULLNUMBER), ''),
  coalesce(group_concat(DISTINCT e.ZADDRESS), ''),
  coalesce(n.ZTEXT, ''),
  coalesce((SELECT group_concat(addr, '|||') FROM (SELECT DISTINCT trim(coalesce(a2.ZSTREET,'') || ', ' || coalesce(a2.ZCITY,'') || ', ' || coalesce(a2.ZSTATE,a2.ZREGION,'') || ', ' || coalesce(a2.ZCOUNTRYNAME,'')) as addr FROM ZABCDPOSTALADDRESS a2 WHERE a2.ZOWNER = r.Z_PK)), '')
FROM ZABCDRECORD r
LEFT JOIN ZABCDPHONENUMBER p ON p.ZOWNER = r.Z_PK
LEFT JOIN ZABCDEMAILADDRESS e ON e.ZOWNER = r.Z_PK
LEFT JOIN ZABCDNOTE n ON n.ZCONTACT = r.Z_PK
LEFT JOIN ZABCDPOSTALADDRESS a ON a.ZOWNER = r.Z_PK`;

const CONTACT_CARD_GROUP_BY = `GROUP BY r.Z_PK`;

function parseContactRow(row: string): ContactCard {
  const cols = row.split("\x1f");
  const name = cols[1]?.trim() || "";
  return {
    name,
    id: cols[0]?.trim() || "",
    organization: cols[2]?.trim() || null,
    jobTitle: cols[3]?.trim() || null,
    phones: cols[4] ? cols[4].split(",").map((s) => s.trim()).filter(Boolean) : [],
    emails: cols[5] ? cols[5].split(",").map((s) => s.trim()).filter(Boolean) : [],
    note: cols[6]?.trim() || null,
    addresses: cols[7] ? cols[7].split("|||").map((s) => s.replace(/(^[, ]+|[, ]+$)/g, "").trim()).filter(Boolean) : [],
  };
}

async function queryContacts(where: string): Promise<ContactCard[]> {
  const db = await findAddressBookDb();
  const sql = `${CONTACT_CARD_SQL} WHERE r.Z_ENT = 22 AND (${where}) ${CONTACT_CARD_GROUP_BY};`;
  const raw = await runSqlite(db, sql);
  if (!raw) return [];
  return raw.split("\n").map(parseContactRow).filter((c) => c.id);
}

export async function listGroups(): Promise<{ name: string }[]> {
  const script = `
tell application "Contacts"
  set groupList to {}
  repeat with g in groups
    set end of groupList to name of g
  end repeat
  set AppleScript's text item delimiters to "${FIELD_DELIM}"
  return groupList as text
end tell`;
  const raw = await runAppleScript(script);
  if (!raw) return [];
  return raw.split(FIELD_DELIM).map((name) => ({ name: name.trim() }));
}

export async function createGroup(name: string): Promise<string> {
  const safeName = sanitize(name);
  const script = `
tell application "Contacts"
  make new group with properties {name:"${safeName}"}
  save
  return "Group created: ${safeName}"
end tell`;
  return runAppleScript(script);
}

export async function listContacts(group?: string): Promise<{ name: string; id: string }[]> {
  let scope: string;
  if (group) {
    const safeGroup = sanitize(group);
    scope = `people of group "${safeGroup}"`;
  } else {
    scope = "people";
  }
  const script = `
tell application "Contacts"
  set contactList to {}
  repeat with p in ${scope}
    set contactName to name of p
    set contactId to id of p
    set end of contactList to contactName & "${FIELD_DELIM}" & contactId
  end repeat
  set AppleScript's text item delimiters to "${RECORD_DELIM}"
  return contactList as text
end tell`;
  const raw = await runAppleScript(script);
  if (!raw) return [];
  return raw.split(RECORD_DELIM).map((record) => {
    const [name, id] = record.split(FIELD_DELIM).map((s) => s.trim());
    return { name, id };
  });
}

export async function getContact(name: string): Promise<{
  name: string;
  id: string;
  emails: string[];
  phones: string[];
  organization: string | null;
  jobTitle: string | null;
  note: string | null;
  addresses: string[];
}> {
  const safeName = sanitize(name);
  const script = `
tell application "Contacts"
  set matchedPeople to (every person whose name is "${safeName}")
  if (count of matchedPeople) is 0 then
    error "Contact not found: ${safeName}"
  end if
  set p to item 1 of matchedPeople
  set contactName to name of p
  set contactId to id of p

  set emailList to {}
  repeat with e in emails of p
    set end of emailList to value of e
  end repeat
  set AppleScript's text item delimiters to ","
  set emailStr to emailList as text

  set phoneList to {}
  repeat with ph in phones of p
    set end of phoneList to value of ph
  end repeat
  set phoneStr to phoneList as text

  set orgStr to ""
  try
    set orgStr to organization of p
  end try

  set titleStr to ""
  try
    set titleStr to job title of p
  end try

  set noteStr to ""
  try
    set noteStr to note of p
  end try

  set addrList to {}
  repeat with a in addresses of p
    set addrParts to {}
    try
      set end of addrParts to street of a
    end try
    try
      set end of addrParts to city of a
    end try
    try
      set end of addrParts to state of a
    end try
    try
      set end of addrParts to zip of a
    end try
    try
      set end of addrParts to country of a
    end try
    set AppleScript's text item delimiters to ", "
    set end of addrList to addrParts as text
  end repeat
  set AppleScript's text item delimiters to "${FIELD_DELIM}"
  set addrStr to addrList as text

  return contactName & "${RECORD_DELIM}" & contactId & "${RECORD_DELIM}" & emailStr & "${RECORD_DELIM}" & phoneStr & "${RECORD_DELIM}" & orgStr & "${RECORD_DELIM}" & titleStr & "${RECORD_DELIM}" & noteStr & "${RECORD_DELIM}" & addrStr
end tell`;
  const raw = await runAppleScript(script);
  const parts = raw.split(RECORD_DELIM);
  return {
    name: parts[0]?.trim() || "",
    id: parts[1]?.trim() || "",
    emails: parts[2] ? parts[2].split(",").map((s) => s.trim()).filter(Boolean) : [],
    phones: parts[3] ? parts[3].split(",").map((s) => s.trim()).filter(Boolean) : [],
    organization: parts[4]?.trim() || null,
    jobTitle: parts[5]?.trim() || null,
    note: parts[6]?.trim() || null,
    addresses: parts[7] ? parts[7].split(FIELD_DELIM).map((s) => s.trim()).filter(Boolean) : [],
  };
}


export async function searchContacts(query: string): Promise<ContactCard[]> {
  const safe = query.replace(/'/g, "''");
  return queryContacts(`(r.ZFIRSTNAME LIKE '%${safe}%' OR r.ZLASTNAME LIKE '%${safe}%' OR r.ZORGANIZATION LIKE '%${safe}%')`);
}

export async function getContactByPhone(phone: string): Promise<ContactCard[]> {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return [];
  const safe = digits.replace(/'/g, "''");
  const normalized = `replace(replace(replace(replace(replace(replace(ZFULLNUMBER,' ',''),'-',''),'(',''),')',''),'+',''),'.','')`;
  let condition = `${normalized} LIKE '%${safe}%'`;
  if (digits.length === 11 && digits.startsWith("1")) {
    const tenDigit = digits.slice(1).replace(/'/g, "''");
    condition += ` OR ${normalized} LIKE '%${tenDigit}%'`;
  } else if (digits.length === 10) {
    const elevenDigit = `1${safe}`;
    condition += ` OR ${normalized} LIKE '%${elevenDigit}%'`;
  }
  return queryContacts(`r.Z_PK IN (SELECT ZOWNER FROM ZABCDPHONENUMBER WHERE ${condition})`);
}

export async function getContactByEmail(email: string): Promise<ContactCard[]> {
  const safe = email.trim().toLowerCase().replace(/'/g, "''");
  if (!safe) return [];
  return queryContacts(`r.Z_PK IN (SELECT ZOWNER FROM ZABCDEMAILADDRESS WHERE lower(ZADDRESS) LIKE '%${safe}%')`);
}

export async function createContact(
  firstName: string,
  lastName: string,
  options?: { email?: string; phone?: string; organization?: string; jobTitle?: string; note?: string }
): Promise<string> {
  const safeFirst = sanitize(firstName);
  const safeLast = sanitize(lastName);
  let props = `{first name:"${safeFirst}", last name:"${safeLast}"`;
  if (options?.organization) props += `, organization:"${sanitize(options.organization)}"`;
  if (options?.jobTitle) props += `, job title:"${sanitize(options.jobTitle)}"`;
  if (options?.note) props += `, note:"${sanitize(options.note)}"`;
  props += "}";

  let extras = "";
  if (options?.email) {
    const safeEmail = sanitize(options.email);
    extras += `\n  make new email at end of emails of newPerson with properties {label:"work", value:"${safeEmail}"}`;
  }
  if (options?.phone) {
    const safePhone = sanitize(options.phone);
    extras += `\n  make new phone at end of phones of newPerson with properties {label:"mobile", value:"${safePhone}"}`;
  }

  const script = `
tell application "Contacts"
  set newPerson to make new person with properties ${props}${extras}
  save
  return "Contact created: ${safeFirst} ${safeLast}"
end tell`;
  return runAppleScript(script);
}

export async function updateContact(
  name: string,
  updates: { firstName?: string; lastName?: string; email?: string; phone?: string; organization?: string; jobTitle?: string; note?: string }
): Promise<string> {
  const safeName = sanitize(name);
  let setStatements = "";
  if (updates.firstName) setStatements += `\n  set first name of p to "${sanitize(updates.firstName)}"`;
  if (updates.lastName) setStatements += `\n  set last name of p to "${sanitize(updates.lastName)}"`;
  if (updates.organization) setStatements += `\n  set organization of p to "${sanitize(updates.organization)}"`;
  if (updates.jobTitle) setStatements += `\n  set job title of p to "${sanitize(updates.jobTitle)}"`;
  if (updates.note) setStatements += `\n  set note of p to "${sanitize(updates.note)}"`;
  if (updates.email) {
    const safeEmail = sanitize(updates.email);
    setStatements += `\n  make new email at end of emails of p with properties {label:"work", value:"${safeEmail}"}`;
  }
  if (updates.phone) {
    const safePhone = sanitize(updates.phone);
    setStatements += `\n  make new phone at end of phones of p with properties {label:"mobile", value:"${safePhone}"}`;
  }
  const script = `
tell application "Contacts"
  set matchedPeople to (every person whose name is "${safeName}")
  if (count of matchedPeople) is 0 then
    error "Contact not found: ${safeName}"
  end if
  set p to item 1 of matchedPeople${setStatements}
  save
  return "Contact updated: ${safeName}"
end tell`;
  return runAppleScript(script);
}

export async function removeContactFromGroup(contactName: string, groupName: string): Promise<string> {
  const safeName = sanitize(contactName);
  const safeGroup = sanitize(groupName);
  const script = `
tell application "Contacts"
  set matchedPeople to (every person whose name is "${safeName}")
  if (count of matchedPeople) is 0 then
    error "Contact not found: ${safeName}"
  end if
  set p to item 1 of matchedPeople
  set g to group "${safeGroup}"
  remove p from g
  save
  return "Removed ${safeName} from group ${safeGroup}"
end tell`;
  return runAppleScript(script);
}

export async function deleteGroup(name: string): Promise<string> {
  const safeName = sanitize(name);
  const script = `
tell application "Contacts"
  set matchedGroups to (every group whose name is "${safeName}")
  if (count of matchedGroups) is 0 then
    error "Group not found: ${safeName}"
  end if
  delete item 1 of matchedGroups
  save
  return "Group deleted: ${safeName}"
end tell`;
  return runAppleScript(script);
}

export async function deleteContact(name: string): Promise<string> {
  const safeName = sanitize(name);
  const script = `
tell application "Contacts"
  set matchedPeople to (every person whose name is "${safeName}")
  if (count of matchedPeople) is 0 then
    error "Contact not found: ${safeName}"
  end if
  delete item 1 of matchedPeople
  save
  return "Contact deleted: ${safeName}"
end tell`;
  return runAppleScript(script);
}

export async function addContactToGroup(contactName: string, groupName: string): Promise<string> {
  const safeName = sanitize(contactName);
  const safeGroup = sanitize(groupName);
  const script = `
tell application "Contacts"
  set matchedPeople to (every person whose name is "${safeName}")
  if (count of matchedPeople) is 0 then
    error "Contact not found: ${safeName}"
  end if
  set p to item 1 of matchedPeople
  set g to group "${safeGroup}"
  add p to g
  save
  return "Added ${safeName} to group ${safeGroup}"
end tell`;
  return runAppleScript(script);
}
