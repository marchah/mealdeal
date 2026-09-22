import { settings } from '../common/settings';
import type { ZipCoordinateLookup } from '../entities/location/types';
import type { AddressCoordinateLookup } from '../entities/merchant/types';
import type { ProductLookup } from '../entities/pantryItem/types';
import type { JsonChatCompletion } from '../ingest/extractor';
import type { HtmlToMarkdownConverter } from '../ingest/markdown';
import { mdreamAdapterFactory } from './mdream/adapter';
import { nominatimAdapterFactory } from './nominatim/adapter';
import { openaiAdapterFactory } from './openai/adapter';
import { productPageAdapterFactory } from './productPage/adapter';
import { productPageServiceFactory } from './productPage/service';
import { zippopotamAdapterFactory } from './zippopotam/adapter';

// The third-party module: builds every external-service adapter behind its port, so the
// composition root injects ports (not providers) into the slices. Swap a provider here.
export interface ThirdPartyServices {
  zippopotamAdapter: ZipCoordinateLookup;
  nominatimAdapter: AddressCoordinateLookup;
  mdreamAdapter: HtmlToMarkdownConverter;
  openaiAdapter: JsonChatCompletion;
  productPageService: ProductLookup;
}

export function getThirdPartyServices(): ThirdPartyServices {
  const mdreamAdapter = mdreamAdapterFactory();
  const openaiAdapter = openaiAdapterFactory({ config: settings });
  return {
    zippopotamAdapter: zippopotamAdapterFactory(),
    nominatimAdapter: nominatimAdapterFactory(),
    mdreamAdapter,
    openaiAdapter,
    // The anti-corruption layer on top of the raw fetch, per AGENTS.md §3: the slice is injected
    // the meaning-bearing port, never the transport.
    productPageService: productPageServiceFactory({
      productPageFetcher: productPageAdapterFactory(),
      htmlToMarkdown: mdreamAdapter,
      jsonChatCompletion: openaiAdapter,
    }),
  };
}
