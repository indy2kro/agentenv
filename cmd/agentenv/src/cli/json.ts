/**
 * The one JSON envelope every `--json` document shares, so a script driving
 * several commands parses one shape: `schemaVersion`, `success`, and always
 * both `messages[]` and `errors[]`. Command-specific fields ride alongside.
 * A bare `message` (the older add/remove/uninstall shape) is kept for
 * compatibility and mirrored into `messages` (or `errors` on failure).
 */
export const JSON_SCHEMA_VERSION = 1;

export interface JsonEnvelopeBase {
  success: boolean;
  message?: string;
  messages?: string[];
  errors?: string[];
}

export type JsonEnvelope<T extends JsonEnvelopeBase> = Omit<T, 'messages' | 'errors'> & {
  schemaVersion: number;
  messages: string[];
  errors: string[];
};

export function jsonEnvelope<T extends JsonEnvelopeBase>(doc: T): JsonEnvelope<T> {
  const messages = doc.messages ?? (doc.message !== undefined && doc.success ? [doc.message] : []);
  const errors = doc.errors ?? (doc.message !== undefined && !doc.success ? [doc.message] : []);
  return { schemaVersion: JSON_SCHEMA_VERSION, ...doc, messages, errors };
}

export function printJson<T extends JsonEnvelopeBase>(doc: T): void {
  console.log(JSON.stringify(jsonEnvelope(doc), null, 2));
}
