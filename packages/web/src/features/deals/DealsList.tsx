import { useQuery } from 'urql';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { graphql } from '../../graphql';

// Colocated, typed operation. Field selections are checked against the committed schema.
const DealsQuery = graphql(`
  query Deals {
    stats {
      activeDeals
      totalDeals
      merchants
    }
    deals(activeOnly: true) {
      id
      title
      discountText
      category
      merchant {
        name
      }
    }
  }
`);

export function DealsList() {
  const [{ data, fetching, error }] = useQuery({ query: DealsQuery });

  if (fetching) return <p className="mt-6 text-muted-foreground">Loading deals…</p>;
  if (error) return <p className="mt-6 text-destructive">Failed to load: {error.message}</p>;

  const deals = data?.deals ?? [];

  return (
    <section className="mt-6 space-y-4">
      {data?.stats && (
        <p className="text-sm text-muted-foreground">
          {data.stats.activeDeals} active · {data.stats.totalDeals} total · {data.stats.merchants}{' '}
          merchants
        </p>
      )}
      {deals.length === 0 ? (
        <p className="text-muted-foreground">No active deals yet.</p>
      ) : (
        <ul className="space-y-4">
          {deals.map((deal) => (
            <li key={deal.id}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{deal.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  <span>{deal.merchant.name}</span>
                  {deal.discountText ? <span> · {deal.discountText}</span> : null}
                  {deal.category ? <span> · {deal.category}</span> : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
