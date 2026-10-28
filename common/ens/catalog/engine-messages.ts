// The texts of the engine's reasons, by code: a byte-for-byte copy of oscompliance-ens catalog/messages kept by
// `config/sync-catalog.ts`. The screens are in Spanish only for now.
import es from './messages/es.json';

const TEXTS: Record<string, string> = es as Record<string, string>;

interface EngineMessage {
  code: string;
  args?: Record<string, unknown>;
}

const isMessage = (value: unknown): value is EngineMessage =>
  Boolean(value) && typeof value === 'object' && typeof (value as EngineMessage).code === 'string';

const argText = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  if (isMessage(value)) return renderEngineMessage(value.code, value.args);
  if (Array.isArray(value)) {
    return value.every(isMessage)
      ? value.map(item => renderEngineMessage(item.code, item.args)).join('; ')
      : value.map(String).join(', ');
  }
  return String(value);
};

// Same rules as the engine's catalog.Message.Render; an unknown code is undefined so the caller falls back.
export const renderEngineMessage = (code?: string, args?: Record<string, unknown>): string | undefined => {
  if (!code || TEXTS[code] === undefined) return undefined;
  return TEXTS[code].replace(/\{([a-z_]+)\}/g, (_, name: string) => argText(args?.[name])).trim();
};
