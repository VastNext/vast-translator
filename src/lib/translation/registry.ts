import type { TranslationProvider } from "./provider";
import { AzureProvider } from "./providers/azure";
import { AgnesProvider } from "./providers/agnes";
import { BingWebProvider } from "./providers/bing-web";
import { GoogleWebProvider } from "./providers/google-web";
import type { ProviderId } from "./types";

export function createProviderRegistry() {
  const providers: TranslationProvider[] = [
    new GoogleWebProvider(),
    new BingWebProvider(),
    new AzureProvider(),
    new AgnesProvider(
      "agnes-2-0",
      "Agnes 2.0",
      "agnes-2.0-flash",
    ),
    new AgnesProvider(
      "agnes-2-5",
      "Agnes 2.5",
      "agnes-2.5-flash",
    ),
  ];
  return new Map<ProviderId, TranslationProvider>(
    providers.map((provider) => [provider.id, provider]),
  );
}
