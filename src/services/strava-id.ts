export const STRAVA_ID_PATH_PATTERN = /^[A-Za-z0-9_-]+$/;

// Match complete JSON string tokens so an ID mentioned inside a string is
// never rewritten. The optional suffix captures a decimal integer member.
// Node 20 does not expose the source token in the JSON.parse reviver.
const longIntegerMember = /("(?:[^"\\]|\\[\s\S])*")(?:(\s*:\s*)(-?[1-9]\d{15,})(?=[ \t\r\n]*[,}]))?/g;

function isIdField(key: string): boolean {
  return key === "id" || key.endsWith("_id");
}

function decimalId(value: unknown): string | undefined {
  return typeof value === "string" && /^[1-9]\d*$/.test(value) ? value : undefined;
}

function preferExactId(value: unknown, exact: string | undefined): unknown {
  if (exact !== undefined) {
    // Keep the legacy numeric type when it agrees exactly with the string.
    return typeof value === "number" && Number.isSafeInteger(value) && String(value) === exact
      ? value
      : exact;
  }
  // An unsafe number that reached this point has no exact integer token.
  return typeof value === "number" && !Number.isSafeInteger(value) ? undefined : value;
}

export function parseStravaJson(source: string): unknown {
  const exactIds = source.replace(longIntegerMember, (match, key, separator, digits) => {
    if (digits === undefined || Number.isSafeInteger(Number(digits)) || !isIdField(JSON.parse(key))) return match;
    return key + separator + JSON.stringify(digits);
  });
  return JSON.parse(exactIds, function (key, value) {
    return isIdField(key) ? preferExactId(value, decimalId(this[key + "_str"])) : value;
  });
}

export function stravaIdFields(record: Record<string, unknown>): { id: string | number | undefined; id_str: string | undefined } {
  const id_str = decimalId(record.id_str);
  const value = preferExactId(record.id, id_str);
  const id = (typeof value === "number" && value > 0) || (typeof value === "string" && value.length > 0)
    ? value
    : undefined;
  return { id, id_str };
}
