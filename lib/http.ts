import { NextResponse } from "next/server";
import { buildSlate, chicagoToday, type Database } from "./engine";
import { researchAvailability } from "./research";
import { bettingProsAvailability } from "./sources/bettingpros";
import { getStore, storageMessage } from "./store";

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function fail(message: string, status = 400): never {
  throw new HttpError(message, status);
}

export function slatePayload(db: Database, date: string) {
  const store = getStore();
  const research = researchAvailability();
  const bettingPros = bettingProsAvailability();
  return {
    ok: true as const,
    storageMode: store.mode,
    storageMessage: storageMessage(store.mode),
    researchState: research.state,
    researchMessage: research.message,
    bettingProsState: bettingPros.state,
    bettingProsMessage: bettingPros.message,
    slate: buildSlate(db, date),
  };
}

export function readDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

export function todayOr(value: unknown): string {
  return readDate(value) ?? chicagoToday();
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text) return {};
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a JSON object.");
  return parsed as Record<string, unknown>;
}

export async function respond(work: () => Promise<unknown>) {
  try {
    const body = await work();
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof HttpError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Request failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
