import type { TranslationProvider } from "./provider";
import { AzureProvider } from "./providers/azure";
import { BingWebProvider } from "./providers/bing-web";
import { GoogleWebProvider } from "./providers/google-web";
import type { ProviderId } from "./types";

export function createProviderRegistry() {
  const providers: TranslationProvider[] = [
    new GoogleWebProvider(),
    new BingWebProvider(),
    new AzureProvider(),
  ];
  return new Map<ProviderId, TranslationProvider>(
    providers.map((provider) => [provider.id, provider]),
  );
}
