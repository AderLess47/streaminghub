/** `next/cache` für Server-Action-Tests. */
export const revalidated: string[] = [];

export function revalidatePath(path: string) {
  revalidated.push(path);
}
