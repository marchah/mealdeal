import { settings } from '../common/settings';
import type { ZipCoordinateLookup } from '../entities/location/types';
import type { AddressCoordinateLookup } from '../entities/merchant/types';
import type { JsonChatCompletion } from '../ingest/extractor';
import type { HtmlToMarkdownConverter } from '../ingest/markdown';
import { mdreamAdapterFactory } from './mdream/adapter';
import { nominatimAdapterFactory } from './nominatim/adapter';
import { openaiAdapterFactory } from './openai/adapter';
import { zippopotamAdapterFactory } from './zippopotam/adapter';

// The third-party module: builds every external-service adapter behind its port, so the
// composition root injects ports (not providers) into the slices. Swap a provider here.
export interface ThirdPartyServices {
  zippopotamAdapter: ZipCoordinateLookup;
  nominatimAdapter: AddressCoordinateLookup;
  mdreamAdapter: HtmlToMarkdownConverter;
  openaiAdapter: JsonChatCompletion;
}

export function getThirdPartyServices(): ThirdPartyServices {
  return {
    zippopotamAdapter: zippopotamAdapterFactory(),
    nominatimAdapter: nominatimAdapterFactory(),
    mdreamAdapter: mdreamAdapterFactory(),
    openaiAdapter: openaiAdapterFactory({ config: settings }),
  };
}
