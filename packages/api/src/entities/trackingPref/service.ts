import { PrefKind, PrefScope } from './types';
import type { AddPrefInput, TrackingPrefRepository, TrackingPrefService } from './types';

export function trackingPrefServiceFactory({
  trackingPrefRepository,
}: {
  trackingPrefRepository: TrackingPrefRepository;
}): TrackingPrefService {
  function listPrefs() {
    return trackingPrefRepository.listPrefs();
  }

  function addPref(input: AddPrefInput) {
    return trackingPrefRepository.addPref(input);
  }

  function removePref(id: string) {
    return trackingPrefRepository.removePref(id);
  }

  async function mutedValues() {
    const muted = await trackingPrefRepository.listPrefsByKind(PrefKind.MUTE);
    const items = new Set<string>();
    const categories = new Set<string>();
    for (const pref of muted) {
      if (pref.scope === PrefScope.ITEM) items.add(pref.value.toLowerCase());
      else categories.add(pref.value.toLowerCase());
    }
    return { items, categories };
  }

  return { listPrefs, addPref, removePref, mutedValues };
}
