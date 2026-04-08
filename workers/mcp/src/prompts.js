import { z } from 'zod'

export function registerPrompts(server) {

  server.registerPrompt('daily_briefing', {
    title: 'Daily Briefing',
    description: 'Generate a structured news briefing. Reads today\'s top stories and provides context for the most significant ones.',
    argsSchema: {
      focus: z.string().optional().describe('Optional focus area: a category (politics, economy, science, tech) or a region/topic')
    }
  }, (args) => {
    const focus = args?.focus
    const focusInstruction = focus
      ? `Focus on ${focus}. Still mention other major stories briefly.`
      : 'Cover all categories evenly.'

    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `You are a news briefing assistant using zuhd.news data. Deliver a concise, factual briefing.

Instructions:
1. Call get_briefing${focus ? ` with focus "${focus}"` : ''} to get today's stories.
2. For the 2-3 most significant stories, call get_story_context to provide background.
3. ${focusInstruction}

Format:
- Lead with the single most important development in one sentence.
- Then cover each category with 1-2 sentences per story.
- End with "What to watch" — 1-2 developing situations.
- Keep the entire briefing under 400 words.
- No opinions. No speculation. Facts and context only.`
        }
      }]
    }
  })

  server.registerPrompt('story_deep_dive', {
    title: 'Story Deep Dive',
    description: 'Comprehensive analysis of a topic: finds related articles, pulls thread context, and analyzes source perspectives.',
    argsSchema: {
      topic: z.string().describe('The topic, event, or story to investigate')
    }
  }, (args) => {
    return {
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: `You are a research assistant using zuhd.news data. Provide a comprehensive but concise analysis of: "${args.topic}"

Instructions:
1. Call search_articles with relevant keywords to find coverage.
2. For the most relevant article, call get_story_context to get the historical timeline.
3. Call get_source_perspectives to understand how different outlets are covering this.
4. Call get_coverage_map if the story has a geographic dimension.

Format:
- Start with a 2-sentence summary of the current situation.
- "Timeline" — key developments in chronological order (from thread context).
- "Source analysis" — which countries/outlets are covering this and any sentiment divergence.
- "What's missing" — perspectives or angles not represented in current coverage.
- Keep the entire analysis under 500 words.
- Cite specific sources by name when stating facts.`
        }
      }]
    }
  })
}
