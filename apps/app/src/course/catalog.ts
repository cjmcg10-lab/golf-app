/** The list of playable courses, written to /courses/index.json by scripts/copy-courses.mjs. */
export interface CourseSummary {
  id: string;
  name: string;
  address: string;
  holes: number;
  par: number;
}

export function filterCourses(list: CourseSummary[], query: string): CourseSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((c) => {
    const text = `${c.name} ${c.address}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}

export async function loadCatalog(fetcher: typeof fetch = fetch): Promise<CourseSummary[]> {
  const r = await fetcher('/courses/index.json');
  if (!r.ok) throw new Error(`Course list unavailable (${r.status})`);
  return (await r.json()) as CourseSummary[];
}
