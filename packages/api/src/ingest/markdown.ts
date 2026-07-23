import { htmlToMarkdown } from 'mdream';

/** Swappable conversion port for the HTML half of an email. */
export interface HtmlToMarkdownConverter {
  convert(html: string): string;
}

const EMAIL_BOILERPLATE_SELECTORS = [
  'header',
  'footer',
  'nav',
  '[role="navigation"]',
  '[role="contentinfo"]',
  '.preheader',
];

/** Converts marketing-email HTML to compact Markdown while excluding common email chrome. */
export function mdreamHtmlToMarkdownConverterFactory(): HtmlToMarkdownConverter {
  function convert(html: string): string {
    return htmlToMarkdown(html, {
      clean: true,
      filter: { exclude: EMAIL_BOILERPLATE_SELECTORS },
    });
  }

  return { convert };
}
