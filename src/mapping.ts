import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type {
  FieldDataEntryInput,
  ManagedCollectionFieldInput,
  ManagedCollectionItemInput,
} from "framer-api";

type CodaColumnFormat = {
  type: string;
  isArray?: boolean;
  table?: {
    id?: string;
    type?: string;
  };
  options?:
    | {
        choices?: Array<{
          name: string;
          id?: string;
        }>;
      }
    | Array<{
        name: string;
        id?: string;
      }>;
};

export type CodaColumnInput = {
  id: string;
  name: string;
  display?: boolean;
  format: CodaColumnFormat;
};

export type ReferenceMapEntry = {
  codaTableId: string;
  framerCollectionId: string;
};

export type NormalizedRow = {
  id?: string;
  values: Record<string, unknown>;
};

type MappingResult = {
  fields: ManagedCollectionFieldInput[];
  items: ManagedCollectionItemInput[];
  warnings: string[];
  skippedCount: number;
};

type ValueWrapper = {
  rawValue?: unknown;
  value?: unknown;
  displayValue?: unknown;
  name?: unknown;
  content?: unknown;
};

type WebPage = {
  "@type": "WebPage";
  url: string;
};

type MonetaryAmount = {
  "@type": "MonetaryAmount";
  amount: number;
};

type ImageObject = {
  "@type": "ImageObject";
  url?: string;
  contentUrl?: string;
  thumbnailUrl?: string;
};

const ALLOWED_TAGS = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "a",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "img",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "blockquote",
  "code",
  "pre",
  "br",
  "hr",
  "span",
];

function markdownToSanitizedHtml(markdown: string): string {
  const rawHtml = marked.parse(markdown, { async: false }) as string;
  return sanitizeHtml(rawHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title", "width", "height"],
      th: ["colspan", "rowspan", "style"],
      td: ["colspan", "rowspan", "style"],
      span: ["style"],
      p: ["style"],
      table: ["style"],
      tr: ["style"],
      thead: ["style"],
      tbody: ["style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}

function extractMeaningfulText(item: unknown): string {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const obj = item as ValueWrapper;
    if (
      "url" in obj &&
      typeof (obj as WebPage).url === "string" &&
      (obj as WebPage)["@type"] === "WebPage"
    ) {
      return (obj as WebPage).url;
    }
    return (
      (typeof obj.rawValue === "string" && obj.rawValue) ||
      (typeof obj.value === "string" && obj.value) ||
      (typeof obj.displayValue === "string" && obj.displayValue) ||
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.content === "string" && obj.content) ||
      String(item)
    );
  }
  return String(item);
}

function stripMarkdown(text: string): string {
  let newText = text;
  newText = newText.replace(/\[([^\]]+)]\(([^)]+)\)/g, (_match, linkText, linkUrl) => {
    if (linkUrl.startsWith("mailto:")) {
      const emailFromUrl = linkUrl.substring(7);
      if (linkText.toLowerCase() === emailFromUrl.toLowerCase()) {
        return emailFromUrl;
      }
      return linkText;
    }
    if (linkText.toLowerCase() === linkUrl.toLowerCase()) {
      return linkText;
    }
    return linkText;
  });
  newText = newText.replace(/```([\s\S]*?)```/g, (_match, group1) => group1.trim());
  newText = newText.replace(/`([^`]*)`/g, (_match, group1) => group1.trim());
  return newText.trim();
}

function extractUrlFromMarkdown(text: string): string {
  const mdImg = text.match(/!\[[^\]]*\]\(([^)]+)\)/);
  if (mdImg && mdImg[1]) return mdImg[1].trim();
  const triple = text.match(/^```([\s\S]*?)```$/);
  if (triple && typeof triple[1] === "string") return triple[1].trim();
  const single = text.match(/^`([^`]*)`$/);
  if (single && typeof single[1] === "string") return single[1].trim();
  return text.trim();
}

function isValidAssetUrl(url: string): boolean {
  const trimmed = url.trim();
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.includes("codahosted.io/")
  );
}

function isLikelyImageUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  return (
    /^https?:\/\/[\S]+\.(jpe?g|png|gif|webp|svg|bmp|tiff?|ico|apng|avif)(\?.*)?$/i.test(
      trimmed,
    ) || /^https?:\/\/codahosted\.io\//.test(trimmed)
  );
}

export function normalizeColumns(columns: CodaColumnInput[]): CodaColumnInput[] {
  return columns.map((column) => ({
    id: String(column.id),
    name: String(column.name ?? column.id),
    format: column.format ?? { type: "text" },
    display: column.display,
  }));
}

export function normalizeRows(rows: unknown[]): NormalizedRow[] {
  return rows.map((row) => {
    if (!row || typeof row !== "object") {
      return { values: {} };
    }
    const obj = row as Record<string, unknown>;
    const id = resolveRowId(obj);
    if (obj.values && typeof obj.values === "object") {
      return { id, values: obj.values as Record<string, unknown> };
    }
    const { id: _ignoredId, _id, values: _ignoredValues, ...rest } = obj;
    return { id, values: rest };
  });
}

export function buildReferenceMap(entries?: ReferenceMapEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  if (!entries) return map;
  for (const entry of entries) {
    if (!entry?.codaTableId || !entry?.framerCollectionId) continue;
    map.set(String(entry.codaTableId), String(entry.framerCollectionId));
  }
  return map;
}

export function mapCodaTypeToFramerType(
  column: CodaColumnInput,
): ManagedCollectionFieldInput | null {
  const baseType = column.format.type.toLowerCase();
  const name = column.name.toLowerCase();
  const id = column.id.toLowerCase();

  if (baseType === "button") {
    return null;
  }

  if (
    baseType === "image" ||
    name.includes("image") ||
    name.includes("graphic") ||
    id.includes("image") ||
    id.includes("graphic")
  ) {
    return {
      id: column.id,
      name: column.name,
      type: "image",
    };
  }

  const enumChoices = Array.isArray(column.format.options)
    ? column.format.options
    : column.format.options?.choices;

  if ((baseType === "select" || baseType === "scale") && enumChoices) {
    return {
      id: column.id,
      name: column.name,
      type: "enum",
      cases: enumChoices.map((choice, index) => ({
        id: choice.id || choice.name || `choice-${index}`,
        name: choice.name,
      })),
    };
  }

  switch (baseType) {
    case "text":
    case "email":
    case "phone":
      return {
        id: column.id,
        name: column.name,
        type: "string",
      };
    case "number":
    case "currency":
    case "percent":
    case "duration":
      return {
        id: column.id,
        name: column.name,
        type: "number",
      };
    case "checkbox":
      return {
        id: column.id,
        name: column.name,
        type: "boolean",
      };
    case "date":
    case "datetime":
      return {
        id: column.id,
        name: column.name,
        type: "date",
      };
    case "time":
      return {
        id: column.id,
        name: column.name,
        type: "string",
      };
    case "image":
      return {
        id: column.id,
        name: column.name,
        type: "image",
      };
    case "file":
      return {
        id: column.id,
        name: column.name,
        type: "file",
        allowedFileTypes: ["*"],
      };
    case "canvas":
    case "richtext":
      return {
        id: column.id,
        name: column.name,
        type: "formattedText",
      };
    case "person":
    case "lookup":
    case "reference":
      if (baseType === "lookup" && !column.format.isArray) {
        return {
          id: column.id,
          name: column.name,
          type: "enum",
          cases: [],
        };
      }
      return {
        id: column.id,
        name: column.name,
        type: "string",
      };
    case "url":
    case "link":
      return {
        id: column.id,
        name: column.name,
        type: "link",
      };
    default:
      return {
        id: column.id,
        name: column.name,
        type: "string",
      };
  }
}

export function buildFieldsAndItems(options: {
  columns: CodaColumnInput[];
  rows: NormalizedRow[];
  slugFieldId: string;
  referenceMap: Map<string, string>;
  use12HourTime?: boolean;
}): MappingResult {
  const { columns, rows, slugFieldId, referenceMap, use12HourTime } = options;
  const warnings: string[] = [];

  const fields = columns
    .map((column) => {
      let mappedField = mapCodaTypeToFramerType(column);

      if (
        mappedField &&
        mappedField.type === "string" &&
        column.format.type.toLowerCase() === "lookup" &&
        column.format.isArray
      ) {
        const refId = column.format.table?.id;
        const linkedCollectionId = refId ? referenceMap.get(refId) : undefined;
        if (linkedCollectionId) {
          mappedField = {
            id: column.id,
            name: column.name,
            type: "multiCollectionReference",
            collectionId: linkedCollectionId,
          };
        } else if (refId) {
          warnings.push(
            `No Framer collection mapping found for lookup field "${column.name}" (Coda table ${refId}).`,
          );
        }
      }

      return mappedField;
    })
    .filter((field): field is ManagedCollectionFieldInput => field !== null);

  const lookupFields = fields.filter((field) =>
    columns.find(
      (column) =>
        column.id === field.id &&
        column.format.type.toLowerCase() === "lookup" &&
        field.type === "enum",
    ),
  );

  if (lookupFields.length > 0) {
    const lookupValueSets = new Map<string, Set<string>>();
    lookupFields.forEach((field) => lookupValueSets.set(field.id, new Set()));

    rows.forEach((row) => {
      lookupFields.forEach((field) => {
        const value = row.values[field.id];
        if (!value) return;
        const values = extractLookupValues(value);
        const valueSet = lookupValueSets.get(field.id);
        values.forEach((item) => valueSet?.add(item.replace(/^```|```$/g, "").trim()));
      });
    });

    lookupFields.forEach((field) => {
      const uniqueValues = Array.from(lookupValueSets.get(field.id) || []).filter(
        (value) => value.length > 0,
      );
      if ("cases" in field && Array.isArray(field.cases)) {
        field.cases = uniqueValues.map((value) => ({
          id: value,
          name: value,
        }));
      }
    });
  }

  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  const codaColumnTypeMap = new Map(
    columns.map((column) => [column.id, column.format.type.toLowerCase()]),
  );

  let skippedCount = 0;
  const items: ManagedCollectionItemInput[] = [];

  rows.forEach((row, index) => {
    const rowId = row.id;
    if (!rowId) {
      skippedCount += 1;
      warnings.push(`Row at index ${index} is missing a row id and was skipped.`);
      return;
    }

    const slugValue = extractSlugValue(row.values[slugFieldId]);
    if (!slugValue) {
      skippedCount += 1;
      warnings.push(`Row ${rowId} is missing a slug value and was skipped.`);
      return;
    }

    const fieldData: Record<string, FieldDataEntryInput> = {};
    for (const [fieldId, value] of Object.entries(row.values)) {
      const field = fieldMap.get(fieldId);
      if (!field) continue;
      const codaType = codaColumnTypeMap.get(fieldId) || "text";
      const transformed = transformCodaValue(value, field, codaType, use12HourTime);
      if (transformed !== null) {
        fieldData[fieldId] = transformed;
      }
    }

    items.push({
      id: rowId,
      slug: slugValue,
      draft: false,
      fieldData,
    });
  });

  return { fields, items, warnings, skippedCount };
}

export function mergeFieldsWithExistingFields(
  sourceFields: readonly ManagedCollectionFieldInput[],
  existingFields: readonly ManagedCollectionFieldInput[],
): ManagedCollectionFieldInput[] {
  const existingFieldMap = new Map(existingFields.map((field) => [field.id, field]));

  return sourceFields.map((sourceField) => {
    const existingField = existingFieldMap.get(sourceField.id);
    if (existingField) {
      return {
        ...sourceField,
        name: existingField.name,
      };
    }
    return sourceField;
  });
}

function extractLookupValues(value: unknown): string[] {
  const results: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((item) => {
      if (typeof item === "string") {
        results.push(item);
        return;
      }
      if (typeof item === "object" && item !== null) {
        const obj = item as Record<string, unknown>;
        if (typeof obj.name === "string") results.push(obj.name);
        else if (typeof obj.value === "string") results.push(obj.value);
      }
    });
  } else if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.name === "string") results.push(obj.name);
    else if (typeof obj.value === "string") results.push(obj.value);
  } else if (typeof value === "string") {
    results.push(value);
  }
  return results;
}

function extractSlugValue(value: unknown): string | null {
  if (typeof value === "string") return stripMarkdown(value).trim();
  if (typeof value === "object" && value !== null) {
    if ("value" in value) {
      const wrapped = (value as { value?: unknown }).value;
      if (typeof wrapped === "string") return stripMarkdown(wrapped).trim();
    }
    const extracted = extractMeaningfulText(value);
    if (extracted) return stripMarkdown(extracted).trim();
  }
  return null;
}

function resolveRowId(row: Record<string, unknown>): string | undefined {
  if (typeof row.id === "string") return row.id;
  if (row._id && typeof row._id === "object" && "value" in row._id) {
    return String((row._id as { value?: unknown }).value ?? "");
  }
  return undefined;
}

function transformCodaValue(
  value: unknown,
  field: ManagedCollectionFieldInput,
  codaColumnType: string,
  use12HourTime?: boolean,
): FieldDataEntryInput | null {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    switch (field.type) {
      case "string":
        return { type: "string", value: "" };
      case "number":
        return { type: "number", value: 0 };
      case "boolean":
        return { type: "boolean", value: false };
      case "date":
        return null;
      case "image":
        return { type: "image", value: "" };
      case "file":
        return { type: "file", value: "" };
      case "formattedText":
        return { type: "formattedText", value: "" };
      case "link":
        return { type: "link", value: "" };
      case "collectionReference":
        return { type: "collectionReference", value: "" };
      case "multiCollectionReference":
        return { type: "multiCollectionReference", value: [] };
      case "enum":
        return { type: "enum", value: "" };
      default:
        return { type: "string", value: "" };
    }
  }

  switch (field.type) {
    case "number": {
      let numericValue: number;
      if (typeof value === "number") {
        numericValue = value;
      } else if (typeof value === "string") {
        let cleanValue = value
          .replace(/[$£€¥]/g, "")
          .replace(/,/g, "")
          .trim();
        if (cleanValue.endsWith("%")) {
          cleanValue = cleanValue.slice(0, -1);
          const parsed = Number(cleanValue);
          numericValue = Number.isNaN(parsed) ? 0 : parsed / 100;
        } else {
          const parsed = Number(cleanValue);
          numericValue = Number.isNaN(parsed) ? 0 : parsed;
        }
      } else if (typeof value === "object" && value !== null) {
        const monetaryAmount = value as MonetaryAmount;
        const obj = value as Record<string, unknown>;
        if (monetaryAmount["@type"] === "MonetaryAmount") {
          numericValue = monetaryAmount.amount;
        } else if (typeof obj.value === "number") {
          numericValue = obj.value;
        } else if (typeof obj.amount === "number") {
          numericValue = obj.amount;
        } else {
          numericValue = 0;
        }
      } else {
        numericValue = 0;
      }
      return { type: "number", value: numericValue };
    }
    case "boolean":
      return { type: "boolean", value: Boolean(value) };
    case "date":
      try {
        let dateValue: string | number | Date =
          typeof value === "string" || typeof value === "number" || value instanceof Date
            ? value
            : "";
        if (typeof value === "object" && value !== null && "value" in value) {
          const wrapped = (value as { value?: unknown }).value;
          dateValue =
            typeof wrapped === "string" ||
            typeof wrapped === "number" ||
            wrapped instanceof Date
              ? wrapped
              : "";
        }
        const dateObj = new Date(String(dateValue));
        if (Number.isNaN(dateObj.getTime())) return null;

        if (codaColumnType === "date") {
          const year = dateObj.getUTCFullYear();
          const month = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
          const day = String(dateObj.getUTCDate()).padStart(2, "0");
          return { type: "date", value: `${year}-${month}-${day}` };
        }

        if (codaColumnType === "datetime" || codaColumnType === "time") {
          if (codaColumnType === "time") {
            const isoDate = dateObj.toISOString();
            const timePart = isoDate.split("T")[1];
            return { type: "date", value: `1970-01-01T${timePart}` };
          }

          const year = dateObj.getFullYear();
          const month = String(dateObj.getMonth() + 1).padStart(2, "0");
          const day = String(dateObj.getDate()).padStart(2, "0");
          const hours = String(dateObj.getHours()).padStart(2, "0");
          const minutes = String(dateObj.getMinutes()).padStart(2, "0");
          const seconds = String(dateObj.getSeconds()).padStart(2, "0");
          const ms = String(dateObj.getMilliseconds()).padStart(3, "0");
          const localAsUtcValue = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}Z`;
          return { type: "date", value: localAsUtcValue };
        }

        return { type: "date", value: dateObj.toISOString() };
      } catch {
        return null;
      }
    case "formattedText": {
      if (codaColumnType === "canvas" || codaColumnType === "richtext") {
        let markdown = "";
        if (typeof value === "object" && value !== null) {
          const obj = value as Record<string, unknown>;
          if (typeof obj.content === "string") {
            markdown = obj.content;
          } else if (typeof obj.value === "string") {
            markdown = obj.value;
          } else {
            const serialized = JSON.stringify(value);
            if (serialized !== "{}") markdown = serialized;
          }
        } else if (typeof value === "string") {
          markdown = value;
        }
        return { type: "formattedText", value: markdownToSanitizedHtml(markdown) };
      }
      return { type: "formattedText", value: String(value) };
    }
    case "string": {
      if (codaColumnType === "time") {
        const formatted = formatTimeValue(value, use12HourTime);
        if (formatted) return { type: "string", value: formatted };
      }
      let textValue = "";
      if (Array.isArray(value) || (value && typeof value === "object" && "rawValue" in value)) {
        const rawArray = Array.isArray(value)
          ? value
          : Array.isArray((value as { rawValue?: unknown }).rawValue)
            ? (value as { rawValue?: unknown[] }).rawValue
            : [];
        textValue = (rawArray ?? []).map(extractMeaningfulText).filter(Boolean).join(", ");
      } else {
        textValue = extractMeaningfulText(value);
      }
      return { type: "string", value: stripMarkdown(textValue) };
    }
    case "image": {
      let imageUrl = "";
      if (typeof value === "string") {
        imageUrl = extractUrlFromMarkdown(value);
      } else if (typeof value === "object" && value !== null) {
        if (Array.isArray(value)) {
          for (const item of value) {
            if (item && typeof item === "object") {
              const obj = item as Record<string, unknown>;
              if (obj["@type"] === "ImageObject") {
                const urls = [
                  obj.url,
                  obj.contentUrl,
                  obj.thumbnailUrl,
                ].filter((url): url is string => typeof url === "string");
              for (const url of urls) {
                if (isValidAssetUrl(url) || isLikelyImageUrl(url)) {
                  imageUrl = url;
                  break;
                }
              }
              }
            }
            if (imageUrl) break;
          }
        } else {
          const obj = value as ImageObject;
          if (obj["@type"] === "ImageObject") {
            const possibleUrls = [obj.url, obj.contentUrl, obj.thumbnailUrl].filter(
              (url): url is string => typeof url === "string",
            );
            for (const url of possibleUrls) {
              if (isValidAssetUrl(url) || isLikelyImageUrl(url)) {
                imageUrl = url;
                break;
              }
            }
          }
        }

        if (typeof value === "object" && value !== null) {
          const obj = value as Record<string, unknown>;
          if (typeof obj.url === "string") {
            imageUrl = obj.url;
          } else if (typeof obj.link === "string") {
            imageUrl = obj.link;
          } else if (typeof obj.value === "string") {
            imageUrl = extractUrlFromMarkdown(obj.value);
          } else if (typeof obj.rawValue === "string") {
            imageUrl = extractUrlFromMarkdown(obj.rawValue);
          } else if (typeof obj.imageUrl === "string") {
            imageUrl = obj.imageUrl;
          } else if (typeof obj.thumbnailUrl === "string") {
            imageUrl = obj.thumbnailUrl;
          }
        }

        if (typeof value === "object" && value !== null) {
          const obj = value as Record<string, unknown>;
          if (obj.linkedRow && typeof obj.linkedRow === "object") {
            const linkedRow = obj.linkedRow as Record<string, unknown>;
            if (typeof linkedRow.url === "string") {
              imageUrl = linkedRow.url;
            } else if (typeof linkedRow.imageUrl === "string") {
              imageUrl = linkedRow.imageUrl;
            }
          }
        }
      }

      if (imageUrl && (isValidAssetUrl(imageUrl) || isLikelyImageUrl(imageUrl))) {
        return { type: "image", value: imageUrl.trim() };
      }
      return null;
    }
    case "file": {
      let fileUrl = "";
      if (typeof value === "string") {
        fileUrl = extractUrlFromMarkdown(value);
      } else if (typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>;
        if (typeof obj.url === "string") {
          fileUrl = obj.url;
        } else if (typeof obj.link === "string") {
          fileUrl = obj.link;
        }
      }
      if (fileUrl && isValidAssetUrl(fileUrl)) {
        return { type: "file", value: fileUrl.trim() };
      }
      return null;
    }
    case "link": {
      let linkUrl = "";
      if (typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>;
        linkUrl = typeof obj.url === "string" ? obj.url : "";
      } else if (typeof value === "string") {
        linkUrl = value;
      }
      return { type: "link", value: linkUrl };
    }
    case "collectionReference": {
      const itemId = extractReferenceId(value);
      return { type: "collectionReference", value: itemId ?? "" };
    }
    case "multiCollectionReference": {
      const itemIds = extractReferenceIds(value);
      return { type: "multiCollectionReference", value: itemIds };
    }
    case "enum": {
      let enumValue = "";
      if (typeof value === "object" && value !== null) {
        const obj = value as Record<string, unknown>;
        if (typeof obj.name === "string") enumValue = obj.name;
        else if (typeof obj.id === "string") enumValue = obj.id;
      } else if (typeof value === "string") {
        enumValue = value;
      } else if (Array.isArray(value) && value.length > 0) {
        const firstItem = value[0];
        if (typeof firstItem === "object" && firstItem !== null && "name" in firstItem) {
          enumValue = String((firstItem as { name?: unknown }).name ?? "");
        } else if (typeof firstItem === "string") {
          enumValue = firstItem;
        }
      }

      if (enumValue) {
        enumValue = enumValue.replace(/^```|```$/g, "").trim();
      }

      if ("cases" in field && Array.isArray(field.cases) && enumValue) {
        const matchingCase = field.cases.find((item) => item.id === enumValue);
        if (matchingCase) {
          return { type: "enum", value: matchingCase.id };
        }
        const matchByName = field.cases.find((item) => item.name === enumValue);
        if (matchByName) {
          return { type: "enum", value: matchByName.id };
        }
      }

      return enumValue ? { type: "enum", value: enumValue } : null;
    }
    default:
      return { type: "string", value: String(value) };
  }
}

function extractReferenceId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === "string") return obj.id;
    if (typeof obj["@id"] === "string") return obj["@id"] as string;
  }
  return null;
}

function extractReferenceIds(value: unknown): string[] {
  const itemIds: string[] = [];
  const processItem = (item: unknown): string | null => {
    if (typeof item === "string") return item;
    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      if (typeof obj.rowId === "string") return obj.rowId;
      if (typeof obj.id === "string") return obj.id;
      if (typeof obj["@id"] === "string") return obj["@id"] as string;
    }
    return null;
  };

  if (Array.isArray(value)) {
    value.forEach((item) => {
      const id = processItem(item);
      if (id) itemIds.push(id);
    });
  } else {
    const id = processItem(value);
    if (id) itemIds.push(id);
  }

  return itemIds;
}

function formatTimeValue(value: unknown, use12HourTime?: boolean): string | null {
  try {
    let hours: number | undefined;
    let minutes: number | undefined;
    let secondsVal: number | undefined;
    let parsed = false;

    if (typeof value === "string") {
      const timeOnlyMatch = value.match(/^([0-1]?\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/);
      if (timeOnlyMatch) {
        hours = parseInt(timeOnlyMatch[1] || "0", 10);
        minutes = parseInt(timeOnlyMatch[2] || "0", 10);
        secondsVal = timeOnlyMatch[4] ? parseInt(timeOnlyMatch[4], 10) : 0;
        parsed = true;
      } else {
        const dateObj = new Date(value);
        if (!Number.isNaN(dateObj.getTime())) {
          hours = dateObj.getHours();
          minutes = dateObj.getMinutes();
          secondsVal = dateObj.getSeconds();
          parsed = true;
        }
      }
    } else if (value instanceof Date) {
      hours = value.getHours();
      minutes = value.getMinutes();
      secondsVal = value.getSeconds();
      parsed = true;
    }

    if (!parsed || hours === undefined || minutes === undefined || secondsVal === undefined) {
      return null;
    }

    if (use12HourTime) {
      const ampm = hours >= 12 ? "PM" : "AM";
      const formattedHours = hours % 12 || 12;
      let formattedTime = `${formattedHours}:${String(minutes).padStart(2, "0")}`;
      if (secondsVal > 0) {
        formattedTime += `:${String(secondsVal).padStart(2, "0")}`;
      }
      return `${formattedTime} ${ampm}`;
    }

    let formattedTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    if (secondsVal > 0) {
      formattedTime += `:${String(secondsVal).padStart(2, "0")}`;
    }
    return formattedTime;
  } catch {
    return null;
  }
}
