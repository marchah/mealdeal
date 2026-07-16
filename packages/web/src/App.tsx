import { DealsList } from './features/deals/DealsList';

export function App() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">MealDeal</h1>
        <p className="text-muted-foreground">Active grocery deals from your inbox.</p>
      </header>
      <DealsList />
    </main>
  );
}
