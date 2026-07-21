import { useState } from 'react';
import { Button } from './components/ui/button';
import { DealsList } from './features/deals/DealsList';
import { NearMeView } from './features/nearMe/NearMeView';

export function App() {
  const [view, setView] = useState<'deals' | 'near-me'>('deals');

  return (
    <main className="mx-auto max-w-3xl p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">MealDeal</h1>
        <p className="text-muted-foreground">Active grocery deals from your inbox.</p>
        <nav className="mt-4 flex gap-2" aria-label="Deal views">
          <Button
            variant={view === 'deals' ? 'default' : 'outline'}
            aria-pressed={view === 'deals'}
            onClick={() => setView('deals')}
          >
            Browse deals
          </Button>
          <Button
            variant={view === 'near-me' ? 'default' : 'outline'}
            aria-pressed={view === 'near-me'}
            onClick={() => setView('near-me')}
          >
            Near me
          </Button>
        </nav>
      </header>
      {view === 'deals' ? <DealsList /> : <NearMeView />}
    </main>
  );
}
