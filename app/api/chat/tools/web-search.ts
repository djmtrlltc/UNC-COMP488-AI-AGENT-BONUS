import { tool } from 'ai';
import { z } from 'zod';
import Exa from 'exa-js';

const exa = new Exa(process.env.EXA_API_KEY);

function buildScopedQuery(query: string, scope: 'truckersmp_kb' | 'truckersmp_rules' | 'web'): string {
  if (scope === 'truckersmp_kb') return `site:truckersmp.com/knowledge-base/article ${query}`;
  if (scope === 'truckersmp_rules') return `site:truckersmp.com/rules ${query}`;
  return query;
}

export const webSearch = tool({
  description: 'Search the web (prioritize TruckersMP Knowledge Base)',
  inputSchema: z.object({
    query: z.string().min(1).describe('The search query'),
    scope: z
      .enum(['truckersmp_kb', 'truckersmp_rules', 'web'])
      .optional()
      .describe('Optional scope. Defaults to truckersmp_kb then falls back to web.'),
  }),
  execute: async ({ query, scope }) => {
    try {
      const primaryScope = scope ?? 'truckersmp_kb';

      const primaryQuery = buildScopedQuery(query, primaryScope);
      const primary = await exa.search(primaryQuery, {
        contents: { text: true },
        numResults: 5,
      });

      // If we targeted KB/rules and got nothing useful, fall back to broader web.
      const needsFallback =
        primaryScope !== 'web' && (!primary?.results || primary.results.length === 0);

      const fallback = needsFallback
        ? await exa.search(buildScopedQuery(query, 'web'), {
            contents: { text: true },
            numResults: 3,
          })
        : null;

      const combined = [
        ...(primary?.results ?? []),
        ...((fallback?.results ?? []).filter((r) => !(primary?.results ?? []).some((p) => p.url === r.url))),
      ].slice(0, 6);

      return combined.map(result => ({
        title: result.title,
        url: result.url,
        content: result.text?.slice(0, 1000) || '',
        publishedDate: result.publishedDate,
      }));
    } catch (error) {
      console.error('Error searching the web:', error);
      return [];
    }
  },
});