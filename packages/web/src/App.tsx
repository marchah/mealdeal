import { type KeyboardEvent } from 'react';
import { Button } from './components/ui/button';
import { CouponsView } from './features/coupons/CouponsView';
import { isCouponsPath } from './features/coupons/routes';
import { PantryView } from './features/pantry/PantryView';
import { useHashRoute } from './lib/useHashRoute';

// Pantry first, and the view an empty hash resolves to: it is the half of the app that works
// today, while coupon ingestion is paused (see features/coupons/CouponIngestBanner).
const TABS = [
  { id: 'pantry', label: 'Pantry', path: '/pantry' },
  { id: 'coupons', label: 'Coupons', path: '/coupons' },
];

const TAB_NAVIGATION_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'Home', 'End']);

function nextTabIndex(key: string, currentIndex: number): number {
  if (key === 'ArrowRight') return (currentIndex + 1) % TABS.length;
  if (key === 'ArrowLeft') return (currentIndex - 1 + TABS.length) % TABS.length;
  if (key === 'Home') return 0;
  if (key === 'End') return TABS.length - 1;
  return currentIndex;
}

export function App() {
  const { path, navigate } = useHashRoute();
  // Anything that is not a coupons route — including `/` and an unknown path — is Pantry.
  const activeIndex = TABS.findIndex(
    (tab) => tab.id === (isCouponsPath(path) ? 'coupons' : 'pantry'),
  );

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!TAB_NAVIGATION_KEYS.has(event.key)) return;
    event.preventDefault();
    const next = TABS[nextTabIndex(event.key, activeIndex)];
    if (!next) return;
    navigate(next.path);
    // Focus follows selection (WAI-ARIA tabs); the target is already mounted, only its
    // roving tabindex changes on the re-render this navigation triggers.
    document.getElementById(`tab-${next.id}`)?.focus();
  }

  const activeTab = TABS[activeIndex];
  if (!activeTab) return null;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">MealDeal</h1>
        <p className="text-muted-foreground">Know a good price when you see one.</p>
      </header>
      <div className="mt-4 flex gap-2" role="tablist" aria-label="Sections">
        {TABS.map((tab, index) => {
          const selected = index === activeIndex;
          return (
            <Button
              key={tab.id}
              id={`tab-${tab.id}`}
              role="tab"
              aria-selected={selected}
              // Only the selected panel is mounted, so only its tab may claim to control one.
              aria-controls={selected ? `panel-${tab.id}` : undefined}
              tabIndex={selected ? 0 : -1}
              variant={selected ? 'default' : 'outline'}
              onClick={() => {
                navigate(tab.path);
              }}
              onKeyDown={handleTabKeyDown}
            >
              {tab.label}
            </Button>
          );
        })}
      </div>
      <div role="tabpanel" id={`panel-${activeTab.id}`} aria-labelledby={`tab-${activeTab.id}`}>
        {activeTab.id === 'coupons' ? <CouponsView /> : <PantryView />}
      </div>
    </main>
  );
}
