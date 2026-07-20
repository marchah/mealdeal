import { PrefKind, PrefScope } from './types';
import type { TrackingPrefRepository, TrackingPrefService } from './types';

export function trackingPrefServiceFactory({
  trackingPrefRepository,
}: {
  trackingPrefRepository: TrackingPrefRepository;
}): TrackingPrefService {
  return {
    list: () => trackingPrefRepository.list(),
    add: (input) => trackingPrefRepository.add(input),
    remove: (id) => trackingPrefRepository.remove(id),
    async mutedValues() {
      const muted = await trackingPrefRepository.listByKind(PrefKind.MUTE);
      const items = new Set<string>();
      const categories = new Set<string>();
      for (const pref of muted) {
        if (pref.scope === PrefScope.ITEM) items.add(pref.value.toLowerCase());
        else categories.add(pref.value.toLowerCase());
      }
      return { items, categories };
    },
  };
}
