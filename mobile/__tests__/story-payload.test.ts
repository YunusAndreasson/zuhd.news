import { articleFromStory, isStoryPayload, sentencesFromHtml } from '../lib/story-payload';

const story = {
  slug: '2026-08-30-biofilm',
  title: 'Model Grades Biofilm Carbon Loops',
  date: '2026-08-30T00:00:00Z',
  dateFormatted: '30 August 2026',
  category: 'science',
  location: 'London',
  eventCoverage: 0,
  bodyHtml:
    '<p><span class="article-dateline">London</span>A new index scores biofilm carbon recycling.</p>\n<p>Wastewater &amp; carbon-capture systems ran on unmeasured claims.</p>',
  sentimentDivergence: null,
  sources: [{ name: 'Nature', url: 'https://www.nature.com/x', country: 'GB', sentiment: null }],
};

describe('a cited story fetched by slug', () => {
  it('reads the body as sentences, without the dateline', () => {
    expect(sentencesFromHtml(story.bodyHtml)).toEqual([
      'A new index scores biofilm carbon recycling.',
      'Wastewater & carbon-capture systems ran on unmeasured claims.',
    ]);
  });

  it('becomes an article in its own category', () => {
    expect(isStoryPayload(story)).toBe(true);
    const resolved = articleFromStory(story);
    expect(resolved?.category).toBe('science');
    expect(resolved?.article).toMatchObject({
      slug: story.slug,
      source: 'Nature',
      location: 'London',
      lat: null,
    });
  });

  it('refuses a payload it cannot place in the river rather than guessing', () => {
    expect(articleFromStory({ ...story, category: 'sport' })).toBeNull();
    expect(articleFromStory({ ...story, bodyHtml: '' })).toBeNull();
    expect(isStoryPayload({ slug: 'x' })).toBe(false);
  });
});
