/**
 * Swappable conversion port for the HTML half of an email. The port stays with its consumer; the
 * mdream implementation lives in third-party/mdream, where AGENTS.md §3 requires a provider's
 * library to sit.
 */
export interface HtmlToMarkdownConverter {
  convert: (html: string) => string;
}
