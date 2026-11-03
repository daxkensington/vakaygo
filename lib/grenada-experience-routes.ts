import {
  getGrenadaExperienceTopic,
  isValidGrenadaExperiencesPage,
  type GrenadaExperienceTopic,
} from "@/lib/grenada-experiences";

export type GrenadaExperienceRoute = { topic?: GrenadaExperienceTopic; page: number };

export function parseGrenadaExperienceRoute(segments: string[] = []): GrenadaExperienceRoute | null {
  if (segments.length === 0) return { page: 1 };
  if (segments.length === 1) {
    const topic = getGrenadaExperienceTopic(segments[0]);
    return topic ? { topic: topic.slug, page: 1 } : null;
  }
  const hasTopic = segments.length === 3;
  if (!hasTopic && segments.length !== 2) return null;
  const topic = hasTopic ? getGrenadaExperienceTopic(segments[0]) : null;
  if (hasTopic && !topic) return null;
  const [marker, rawPage] = segments.slice(hasTopic ? 1 : 0);
  if (marker !== "page" || !/^[1-9]\d*$/.test(rawPage)) return null;
  const page = Number(rawPage);
  if (page < 2 || !isValidGrenadaExperiencesPage(page)) return null;
  return topic ? { topic: topic.slug, page } : { page };
}

export function grenadaExperiencePath(topic?: GrenadaExperienceTopic, page = 1): string {
  if (!isValidGrenadaExperiencesPage(page) || (topic && !getGrenadaExperienceTopic(topic))) {
    throw new RangeError("Unknown Grenada experience route");
  }
  return `/grenada/experiences${topic ? `/${topic}` : ""}${page > 1 ? `/page/${page}` : ""}`;
}
