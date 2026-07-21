import { useQuery } from 'urql';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { graphql, type ResultOf } from '../../graphql';

const NearMeQuery = graphql(`
  query NearMe {
    storesNearMe {
      __typename
      ... on QueryStoresNearMeSuccess {
        data {
          id
          name
          address
          distanceMiles
        }
      }
    }
    dealsNearMe {
      __typename
      ... on QueryDealsNearMeSuccess {
        data {
          couponType {
            id
            key
            label
          }
          deals {
            id
            title
            discountText
            merchant {
              name
            }
          }
        }
      }
    }
    recommendedNewsletters {
      __typename
      ... on QueryRecommendedNewslettersSuccess {
        data {
          id
          name
          signupUrl
        }
      }
    }
  }
`);

type NearMeData = ResultOf<typeof NearMeQuery>;
type StoresResult = NearMeData['storesNearMe'];
type DealsResult = NearMeData['dealsNearMe'];
type NewslettersResult = NearMeData['recommendedNewsletters'];

function hasStores(
  result: StoresResult,
): result is Extract<StoresResult, { __typename: 'QueryStoresNearMeSuccess' }> {
  return result.__typename === 'QueryStoresNearMeSuccess';
}

function hasDeals(
  result: DealsResult,
): result is Extract<DealsResult, { __typename: 'QueryDealsNearMeSuccess' }> {
  return result.__typename === 'QueryDealsNearMeSuccess';
}

function hasNewsletters(
  result: NewslettersResult,
): result is Extract<NewslettersResult, { __typename: 'QueryRecommendedNewslettersSuccess' }> {
  return result.__typename === 'QueryRecommendedNewslettersSuccess';
}

export function NearMeView() {
  const [{ data, fetching, error }] = useQuery({ query: NearMeQuery });

  if (fetching)
    return (
      <p className="mt-6 text-muted-foreground" role="status">
        Finding nearby deals…
      </p>
    );
  if (error)
    return (
      <p className="mt-6 text-destructive" role="alert">
        Failed to load nearby deals: {error.message}
      </p>
    );
  if (!data) return null;

  if (
    !hasStores(data.storesNearMe) ||
    !hasDeals(data.dealsNearMe) ||
    !hasNewsletters(data.recommendedNewsletters)
  ) {
    return (
      <section className="mt-6 space-y-2" aria-labelledby="near-me-unavailable">
        <h2 id="near-me-unavailable" className="text-lg font-semibold">
          Near me is unavailable
        </h2>
        <p className="text-muted-foreground">
          Set a valid USER_LOCATION ZIP code to see stores and deals near you, then try again.
        </p>
      </section>
    );
  }

  const stores = data.storesNearMe.data;
  const dealGroups = data.dealsNearMe.data;
  const newsletters = data.recommendedNewsletters.data;

  return (
    <section className="mt-6 space-y-6" aria-labelledby="near-me-heading">
      <div>
        <h2 id="near-me-heading" className="text-lg font-semibold">
          Near me
        </h2>
        <p className="text-sm text-muted-foreground">
          Nearby stores, their active deals, and signup tips.
        </p>
      </div>

      <section aria-labelledby="nearby-stores-heading">
        <h3 id="nearby-stores-heading" className="text-base font-semibold">
          Nearby stores
        </h3>
        {stores.length === 0 ? (
          <p className="mt-2 text-muted-foreground">No stores found within 25 miles.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {stores.map((store) => (
              <li key={store.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{store.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    <span>{store.distanceMiles.toFixed(1)} miles away</span>
                    {store.address ? <span> · {store.address}</span> : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="nearby-deals-heading">
        <h3 id="nearby-deals-heading" className="text-base font-semibold">
          Active deals by coupon type
        </h3>
        {dealGroups.length === 0 ? (
          <p className="mt-2 text-muted-foreground">No active deals found at nearby stores.</p>
        ) : (
          <div className="mt-2 space-y-4">
            {dealGroups.map((group) => (
              <section
                key={group.couponType?.id ?? 'unclassified'}
                aria-label={group.couponType?.label ?? 'Unclassified'}
              >
                <h4 className="text-sm font-medium">{group.couponType?.label ?? 'Unclassified'}</h4>
                <ul className="mt-2 space-y-2">
                  {group.deals.map((deal) => (
                    <li key={deal.id}>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">{deal.title}</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground">
                          <span>{deal.merchant.name}</span>
                          {deal.discountText ? <span> · {deal.discountText}</span> : null}
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="newsletter-heading">
        <h3 id="newsletter-heading" className="text-base font-semibold">
          Recommended newsletters
        </h3>
        {newsletters.length === 0 ? (
          <p className="mt-2 text-muted-foreground">
            No newsletter recommendations for nearby stores.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {newsletters.map((newsletter) => (
              <li key={newsletter.id}>
                <a
                  className="text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  href={newsletter.signupUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Sign up for {newsletter.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
