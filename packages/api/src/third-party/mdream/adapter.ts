import { htmlToMarkdown } from 'mdream';
import type { HtmlToMarkdownConverter } from '../../ingest/markdown';

const EMAIL_BOILERPLATE_SELECTORS = [
  'header',
  'footer',
  'nav',
  '[role="navigation"]',
  '[role="contentinfo"]',
  '.preheader',
];

/**
 * mdream adapter for the `HtmlToMarkdownConverter` port. It owns only the library call and the
 * exclusion list, so swapping converters is a change to this file alone.
 */
export function mdreamAdapterFactory(): HtmlToMarkdownConverter {
  function convert(html: string): string {
    return htmlToMarkdown(html, {
      clean: true,
      filter: { exclude: EMAIL_BOILERPLATE_SELECTORS },
    });
  }

  return { convert };
}
