import { teamAllProjects } from "@/lib/webcraft-ai-judging";

export type VotingWebcraftProject = { id: string; name: string; url: string; updatedAt: string | null };

/** Published WebCraft projects per team (team and member accounts), latest first — for voting links. */
export async function webcraftLinks(ec: { eventId: string; competitionId: string }): Promise<Record<string, VotingWebcraftProject[]>> {
  const all = await teamAllProjects(ec);
  return Object.fromEntries([...all].map(([teamId, list]) => [teamId, list.map(p => ({
    id: p.id, name: p.name, url: p.published_url, updatedAt: p.updated_at ?? p.published_at,
  }))]));
}
