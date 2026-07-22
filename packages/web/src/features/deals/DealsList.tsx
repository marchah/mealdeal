import { useId, useState } from 'react';
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
      couponType {
        id
        key
        label
      }
      merchant {
        name
      }
    }
    getCouponTypes {
      id
      key
      label
    }
  }
`);

export function DealsList() {
  const [{ data, fetching, error }] = useQuery({ query: DealsQuery });
  const [couponType, setCouponType] = useState('all');
  const filterId = useId();

  if (fetching)
    return (
      <p className="mt-6 text-muted-foreground" role="status">
        Loading deals…
      </p>
    );
  if (error)
    return (
      <p className="mt-6 text-destructive" role="alert">
        Failed to load: {error.message}
      </p>
    );

  const deals = data?.deals ?? [];
  const filteredDeals = deals.filter((deal) => {
    if (couponType === 'all') return true;
    if (couponType === 'unclassified') return deal.couponType === null;
    return deal.couponType?.key === couponType;
  });

  return (
    <section className="mt-6 space-y-4">
      {data?.stats && (
        <p className="text-sm text-muted-foreground">
          {data.stats.activeDeals} active · {data.stats.totalDeals} total · {data.stats.merchants}{' '}
          merchants
        </p>
      )}
      <div className="flex max-w-xs flex-col gap-1">
        <label className="text-sm font-medium" htmlFor={filterId}>
          Coupon type
        </label>
        <select
          id={filterId}
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={couponType}
          onChange={(event) => setCouponType(event.target.value)}
        >
          <option value="all">All coupon types</option>
          {data?.getCouponTypes.map((type) => (
            <option key={type.id} value={type.key}>
              {type.label}
            </option>
          ))}
          <option value="unclassified">Unclassified</option>
        </select>
      </div>
      {filteredDeals.length === 0 ? (
        <p className="text-muted-foreground">No active deals yet.</p>
      ) : (
        <ul className="space-y-4">
          {filteredDeals.map((deal) => (
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
