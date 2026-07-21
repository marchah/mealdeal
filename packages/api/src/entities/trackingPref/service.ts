import { PrefKind, PrefScope } from './types';
import type { AddPrefInput, TrackingPrefRepository, TrackingPrefService } from './types';

export function trackingPrefServiceFactory({
  trackingPrefRepository,
}: {
  trackingPrefRepository: TrackingPrefRepository;
}): TrackingPrefService {
  function list() {
    return trackingPrefRepository.list();
  }

  function add(input: AddPrefInput) {
    return trackingPrefRepository.add(input);
  }

  function remove(id: string) {
    return trackingPrefRepository.remove(id);
  }

  async function mutedValues() {
    const muted = await trackingPrefRepository.listByKind(PrefKind.MUTE);
    const items = new Set<string>();
    const categories = new Set<string>();
    for (const pref of muted) {
      if (pref.scope === PrefScope.ITEM) items.add(pref.value.toLowerCase());
      else categories.add(pref.value.toLowerCase());
    }
    return { items, categories };
  }

  return { list, add, remove, mutedValues };
}
