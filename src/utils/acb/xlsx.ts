type ZipEntry = {
  compressionMethod: number;
  compressedSize: number;
  localOffset: number;
};

const textDecoder = new TextDecoder();

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minOffset = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minOffset; offset--) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  throw new Error("Missing ZIP central directory");
}

function readZipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let offset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map<string, ZipEntry>();

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory");
    }
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const name = textDecoder.decode(bytes.slice(nameStart, nameStart + fileNameLength));
    entries.set(name, { compressionMethod, compressedSize, localOffset });
    offset = nameStart + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

async function readZipText(bytes: Uint8Array, entries: Map<string, ZipEntry>, name: string) {
  const entry = entries.get(name);
  if (!entry) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) {
    throw new Error("Invalid ZIP local header");
  }
  const localNameLength = view.getUint16(entry.localOffset + 26, true);
  const localExtraLength = view.getUint16(entry.localOffset + 28, true);
  const dataStart = entry.localOffset + 30 + localNameLength + localExtraLength;
  const raw = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) {
    return textDecoder.decode(raw);
  }
  if (entry.compressionMethod === 8) {
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const inflated = await new Response(stream).arrayBuffer();
    return textDecoder.decode(inflated);
  }
  throw new Error("Unsupported ZIP compression method");
}

function decodeXml(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function attr(xml: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(xml);
  return match ? decodeXml(match[1]) : undefined;
}

function tagText(xml: string, tag: string): string | undefined {
  const match = new RegExp(
    `<(?:(?:\\w+):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:\\w+):)?${tag}>`,
  ).exec(xml);
  return match ? decodeXml(match[1]) : undefined;
}

function allTagText(xml: string, tag: string): string {
  const parts: string[] = [];
  const regex = new RegExp(
    `<(?:(?:\\w+):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:\\w+):)?${tag}>`,
    "g",
  );
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    parts.push(decodeXml(match[1]));
  }
  return parts.join("");
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const strings: string[] = [];
  const regex = /<(?:(?:\w+):)?si\b[^>]*>([\s\S]*?)<\/(?:(?:\w+):)?si>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml))) {
    strings.push(allTagText(match[1], "t"));
  }
  return strings;
}

function columnIndex(ref: string | undefined, fallback: number): number {
  const letters = ref?.match(/^[A-Za-z]+/)?.[0];
  if (!letters) return fallback;
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return index - 1;
}

function cellValue(cell: string, sharedStrings: string[]): string {
  const openTag = cell.match(/^<(?:(?:\w+):)?c\b([^>]*)>/)?.[1] ?? "";
  const type = attr(openTag, "t");
  if (type === "s") {
    const index = Number(tagText(cell, "v") ?? "");
    return Number.isInteger(index) ? (sharedStrings[index] ?? "") : "";
  }
  if (type === "inlineStr" || cell.includes("<is") || cell.includes(":is")) {
    return allTagText(cell, "t");
  }
  return tagText(cell, "v") ?? "";
}

function parseRows(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowRegex = /<(?:(?:\w+):)?row\b[^>]*>([\s\S]*?)<\/(?:(?:\w+):)?row>/g;
  const cellRegex = /<(?:(?:\w+):)?c\b[^>]*>[\s\S]*?<\/(?:(?:\w+):)?c>/g;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(xml))) {
    const row: string[] = [];
    let nextColumn = 0;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const cell = cellMatch[0];
      const openTag = cell.match(/^<(?:(?:\w+):)?c\b([^>]*)>/)?.[1] ?? "";
      const index = columnIndex(attr(openTag, "r"), nextColumn);
      while (row.length < index) row.push("");
      row[index] = cellValue(cell, sharedStrings);
      nextColumn = index + 1;
    }
    rows.push(row);
  }
  return rows;
}

function resolveWorksheetPath(
  entries: Map<string, ZipEntry>,
  workbookXml: string | undefined,
  relsXml: string | undefined,
): string {
  if (entries.has("xl/worksheets/sheet1.xml")) return "xl/worksheets/sheet1.xml";
  const sheetMatch = workbookXml?.match(/<(?:(?:\w+):)?sheet\b[^>]*(?:\w+:)?id="([^"]+)"/);
  const relId = sheetMatch?.[1];
  if (relId && relsXml) {
    const relRegex = /<Relationship\b[^>]*>/g;
    let relMatch: RegExpExecArray | null;
    while ((relMatch = relRegex.exec(relsXml))) {
      const rel = relMatch[0];
      if (attr(rel, "Id") !== relId) continue;
      const target = attr(rel, "Target");
      if (target?.startsWith("/")) return target.slice(1);
      if (target) return `xl/${target}`;
    }
  }
  const firstWorksheet = [...entries.keys()].find((name) =>
    /^xl\/worksheets\/[^/]+\.xml$/.test(name),
  );
  if (firstWorksheet) return firstWorksheet;
  throw new Error("Missing worksheet");
}

export async function readSheetRows(buf: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buf);
  const entries = readZipEntries(bytes);
  const workbookXml = await readZipText(bytes, entries, "xl/workbook.xml");
  const relsXml = await readZipText(bytes, entries, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = await readZipText(bytes, entries, "xl/sharedStrings.xml");
  const worksheetPath = resolveWorksheetPath(entries, workbookXml, relsXml);
  const sheetXml = await readZipText(bytes, entries, worksheetPath);
  if (!sheetXml) throw new Error("Missing worksheet");
  return parseRows(sheetXml, parseSharedStrings(sharedStringsXml));
}
