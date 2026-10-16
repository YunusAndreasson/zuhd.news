import { shareUrl } from '@shared/share';
import { redirectSystemPath } from '../app/+native-intent';
import { storyShare } from '../lib/story-share';

const story = { slug: '2026-10-16-gaza-aid-corridor', title: 'Aid corridor opens' };

it('shares the website’s share link, the one the site’s own buttons send', () => {
  const { content } = storyShare(story, 'ios');
  expect('url' in content && content.url).toBe(shareUrl(story.slug));
  expect(shareUrl(story.slug)).toBe('https://zuhd.news/s/2026-10-16-gaza-aid-corridor');
});

it('hands iOS the link and the title apart, the title as a mail’s subject', () => {
  expect(storyShare(story, 'ios')).toEqual({
    content: {
      url: 'https://zuhd.news/s/2026-10-16-gaza-aid-corridor',
      title: 'Aid corridor opens',
    },
    options: { subject: 'Aid corridor opens — zuhd.news' },
  });
});

it('hands Android one message, the title over the link', () => {
  expect(storyShare(story, 'android')).toEqual({
    content: {
      message: 'Aid corridor opens\nhttps://zuhd.news/s/2026-10-16-gaza-aid-corridor',
      title: 'Aid corridor opens',
    },
    options: { dialogTitle: 'Share' },
  });
});

it('sends a link the app opens on that story', () => {
  const url = shareUrl(story.slug);
  expect(redirectSystemPath({ path: url, initial: true })).toBe(`/?story=${story.slug}`);
});
