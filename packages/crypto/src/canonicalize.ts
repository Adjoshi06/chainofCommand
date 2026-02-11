const canonicalNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    throw new Error("Non-finite numbers are not valid in canonical JSON");
  }
  if (Object.is(value, -0)) {
    return "0";
  }
  return JSON.stringify(value);
};

const canonicalString = (value: string): string => JSON.stringify(value.normalize("NFC"));

const canonicalArray = (value: unknown[]): string =>
  `[${value.map((item) => canonicalize(item)).join(",")}]`;

const canonicalObject = (value: Record<string, unknown>): string => {
  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  return `{${entries
    .map(([key, entryValue]) => `${canonicalString(key)}:${canonicalize(entryValue)}`)
    .join(",")}}`;
};

export const canonicalize = (value: unknown): string => {
  if (value === null) {
    return "null";
  }

  const valueType = typeof value;

  if (valueType === "boolean") {
    return value ? "true" : "false";
  }
  if (valueType === "number") {
    return canonicalNumber(value);
  }
  if (valueType === "string") {
    return canonicalString(value);
  }
  if (Array.isArray(value)) {
    return canonicalArray(value);
  }
  if (valueType === "object") {
    return canonicalObject(value as Record<string, unknown>);
  }

  throw new Error(`Unsupported value type for canonicalization: ${valueType}`);
};

export const canonicalizeToBytes = (value: unknown): Buffer =>
  Buffer.from(canonicalize(value), "utf8");
