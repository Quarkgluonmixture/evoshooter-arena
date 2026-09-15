/** Tiny DOM helpers shared by the panels. */
export const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

export const NEUTRAL = '#c3c2b7';

/** The first file of a file input, parsed as JSON; null when the picker was cancelled. */
export async function pickedJson<T>(e: Event): Promise<{ name: string; data: T } | null> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return null;
  return { name: file.name, data: JSON.parse(await file.text()) as T };
}
