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
      const muted = await trackingPrefRepository.listByKind('mute');
      const items = new Set<string>();
      const categories = new Set<string>();
      for (const pref of muted) {
        if (pref.scope === 'item') items.add(pref.value.toLowerCase());
        else categories.add(pref.value.toLowerCase());
      }
      return { items, categories };
    },
  };
}
