import { describe, expect, it } from 'vitest';
import { mdreamHtmlToMarkdownConverterFactory } from './markdown';

describe('mdreamHtmlToMarkdownConverterFactory', () => {
  it('preserves offer structure while removing configured email boilerplate', () => {
    const converter = mdreamHtmlToMarkdownConverterFactory();

    const markdown = converter.convert(`
      <header>View this email in your browser</header>
      <div class="preheader">Preview text</div>
      <main>
        <h1>Weekly offers</h1>
        <p><a href="https://shop.example/deals">Shop deals</a></p>
        <table>
          <thead><tr><th>Item</th><th>Price</th></tr></thead>
          <tbody><tr><td>Cheese</td><td>$2.99</td></tr></tbody>
        </table>
      </main>
      <footer>Unsubscribe</footer>
    `);

    expect(markdown).toContain('# Weekly offers');
    expect(markdown).toContain('[Shop deals](https://shop.example/deals)');
    expect(markdown).toContain('| Item | Price |');
    expect(markdown).toContain('| Cheese | $2.99 |');
    expect(markdown).not.toContain('View this email');
    expect(markdown).not.toContain('Preview text');
    expect(markdown).not.toContain('Unsubscribe');
  });
});
