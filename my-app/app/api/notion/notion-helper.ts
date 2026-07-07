function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKey(value: unknown): string {
  return normalizeText(value)
    .replace(/[_\s-]+/g, " ")
    .trim()
    .toLowerCase();
}

function safeParseJson(value: unknown): any {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseDateValue(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const text = normalizeText(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function normalizeSchemaPropertiesInput(schemaProperties: unknown): Record<string, any> {
  if (!schemaProperties) return {};
  if (Array.isArray(schemaProperties)) {
    try {
      return Object.fromEntries(
        schemaProperties
          .filter((p: any) => p && typeof p.name === "string")
          .map((p: any) => [p.name, p.type || "rich_text"])
      );
    } catch {
      return {};
    }
  }
  if (schemaProperties && typeof schemaProperties === "object" && Array.isArray((schemaProperties as any).properties)) {
    try {
      return Object.fromEntries(
        (schemaProperties as any).properties
          .filter((p: any) => p && typeof p.name === "string")
          .map((p: any) => [p.name, p.type || (p && p.type) || "rich_text"])
      );
    } catch {
      return {};
    }
  }
  if (typeof schemaProperties === "object") return schemaProperties as Record<string, any>;
  return {};
}

function inferNotionPropertyType(propertyKey: string, rawValue: unknown): string {
  const key = normalizeKey(propertyKey);
  if (!key) return "rich_text";

  if (/(^title$|^name$|subject|headline|heading)/.test(key)) return "title";
  if (/(description|content|body|note|memo|summary|detail|comment|message|sentence|prompt|question)/.test(key)) return "rich_text";
  if (/(status|state|stage|type|category|priority|label|role|topic|level)/.test(key)) return "select";
  if (/(tags|labels|categories|genres|topics|people|assignees)/.test(key)) return "multi_select";
  if (/(date|due|deadline|created|updated|finished|time|start|end)/.test(key)) return "date";
  if (/(url|link|website|homepage|page|path)/.test(key)) return "url";
  if (/(email|mail)/.test(key)) return "email";
  if (/(phone|tel|mobile|contact)/.test(key)) return "phone_number";
  if (/(^(is|has|should|was|can|did|do|done)|_(is|has|done)$|checkbox|completed|active|enabled)/.test(key) || typeof rawValue === "boolean") return "checkbox";
  if (Array.isArray(rawValue)) return "multi_select";
  if (typeof rawValue === "number") return "number";
  return "rich_text";
}

function buildNotionSchemaMap(schemaProperties: unknown) {
  const exactMatches = new Map<string, { name: string; type: string }>();
  const groupedByType: Record<string, Array<{ name: string; type: string }>> = {};

  const normalized = normalizeSchemaPropertiesInput(schemaProperties);
  if (!normalized || typeof normalized !== "object") {
    return { exactMatches, groupedByType };
  }

  Object.entries(normalized).forEach(([name, value]) => {
    const type = typeof value === "string" ? value : inferNotionPropertyType(name, value);
    const key = normalizeKey(name);
    exactMatches.set(key, { name, type });
    groupedByType[type] = groupedByType[type] || [];
    groupedByType[type].push({ name, type });
  });

  return { exactMatches, groupedByType };
}

function lookupNotionProperty(rawKey: string, schemaMap: ReturnType<typeof buildNotionSchemaMap>, rawValue: unknown) {
  const normalizedKey = normalizeKey(rawKey);
  const exact = schemaMap.exactMatches.get(normalizedKey);
  if (exact) return exact;

  const inferredType = inferNotionPropertyType(rawKey, rawValue);
  const fallbackByType = schemaMap.groupedByType[inferredType];
  if (Array.isArray(fallbackByType) && fallbackByType.length > 0) {
    return fallbackByType[0];
  }

  return { name: rawKey.trim() || "Title", type: inferredType };
}

function normalizeNotionTextValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeNotionTextValue(item))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value).trim();
}

function buildTitleProperty(content: string) {
  return {
    title: [
      {
        text: {
          content: normalizeText(content) || "Untitled",
        },
      },
    ],
  };
}

function buildNotionPropertyValue(type: string, rawValue: unknown) {
  const valueText = normalizeNotionTextValue(rawValue);

  switch (type) {
    case "title":
      return buildTitleProperty(valueText);
    case "rich_text":
      return { rich_text: [{ type: "text", text: { content: valueText } }] };
    case "number": {
      const numberValue = Number(rawValue);
      return Number.isFinite(numberValue)
        ? { number: numberValue }
        : { number: 0 };
    }
    case "checkbox":
      return { checkbox: Boolean(rawValue) };
    case "url":
      return { url: valueText || null };
    case "email":
      return { email: valueText || null };
    case "phone_number":
      return { phone_number: valueText || null };
    case "date": {
      const parsed = parseDateValue(rawValue);
      return { date: { start: parsed || new Date().toISOString() } };
    }
    case "select":
      return {
        select: {
          name: valueText || String(rawValue) || "Uncategorized",
        },
      };
    case "multi_select": {
      const items = Array.isArray(rawValue)
        ? rawValue
        : typeof rawValue === "string"
        ? rawValue.split(/[,;]+/)
        : [rawValue];
      return {
        multi_select: items
          .map((item) => ({ name: normalizeNotionTextValue(item) }))
          .filter((item) => item.name),
      };
    }
    default:
      return { rich_text: [{ type: "text", text: { content: valueText } }] };
  }
}

function createFallbackTitle(payload: unknown) {
  const values = Array.isArray(payload)
    ? payload.map(normalizeNotionTextValue)
    : Object.values(payload || {}).map(normalizeNotionTextValue);
  const titleText = values.filter(Boolean).join(" / ").trim();
  return buildTitleProperty(titleText || "Notion update");
}

function ensureRequiredProperties(properties: Record<string, any>, schemaProperties: unknown = {}, payload: unknown = {}) {
  const normalized = normalizeSchemaPropertiesInput(schemaProperties);
  if (!normalized || typeof normalized !== "object") return properties;

  const schemaEntries = Object.entries(normalized).map(([name, val]) => {
    const type = typeof val === "string" ? val : (val && (val as any).type) || inferNotionPropertyType(name, val);
    return { name, type };
  });

  for (const { name, type } of schemaEntries) {
    if (properties[name]) {
      if (type === "date") {
        const hasDate = properties[name] && properties[name].date && parseDateValue(properties[name].date.start);
        if (!hasDate) {
          properties[name] = { date: { start: new Date().toISOString() } };
        }
      }
      continue;
    }

    switch (type) {
      case "title":
        properties[name] = createFallbackTitle(payload);
        break;
      case "date":
        properties[name] = { date: { start: new Date().toISOString() } };
        break;
      case "number":
        properties[name] = { number: 0 };
        break;
      case "select":
        properties[name] = { select: { name: "Uncategorized" } };
        break;
      case "multi_select":
        properties[name] = { multi_select: [] };
        break;
      case "checkbox":
        properties[name] = { checkbox: false };
        break;
      default:
        properties[name] = { rich_text: [{ type: "text", text: { content: "" } }] };
        break;
    }
  }

  const hasTitle = Object.values(properties).some((p) => p && (p as any).title);
  if (!hasTitle) {
    properties.Title = createFallbackTitle(payload);
  }

  return properties;
}

function buildNotionProperties(payload: unknown = {}, schemaProperties: unknown = {}) {
  const normalizedPayload = typeof payload === "string" ? safeParseJson(payload) || { content: payload } : payload || {};
  const schemaMap = buildNotionSchemaMap(schemaProperties);
  const properties: Record<string, any> = {};

  Object.entries(normalizedPayload as Record<string, any>).forEach(([key, value]) => {
    const propertyInfo = lookupNotionProperty(key, schemaMap, value);
    const notionValue = buildNotionPropertyValue(propertyInfo.type, value);
    if (!notionValue) return;
    if (!properties[propertyInfo.name]) {
      properties[propertyInfo.name] = notionValue;
    }
  });

  const hasTitle = Object.values(properties).some((property) => property?.title);
  if (!hasTitle) {
    properties.Title = createFallbackTitle(normalizedPayload);
  }

  return ensureRequiredProperties(properties, schemaProperties, normalizedPayload);
}

export function getNotionPageProperties(payload: unknown = {}, schemaProperties: unknown = {}) {
  return buildNotionProperties(payload, schemaProperties);
}

export function buildNotionSavePayload(questionText: string, schemaProperties: unknown = {}) {
  const payload = {
    title: questionText,
    name: questionText,
    content: questionText,
    description: questionText,
    body: questionText,
    note: questionText,
    summary: questionText,
  };

  return buildNotionProperties(payload, schemaProperties);
}

export { collectNotionPageInfo, searchNotionPages } from "./notion.js";
