/* eslint-disable */
/* prettier-ignore */

export type introspection_types = {
    'Boolean': unknown;
    'ConflictError': { kind: 'OBJECT'; name: 'ConflictError'; fields: { 'message': { name: 'message'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; }; };
    'DateTime': unknown;
    'Deal': { kind: 'OBJECT'; name: 'Deal'; fields: { 'category': { name: 'category'; type: { kind: 'SCALAR'; name: 'String'; ofType: null; } }; 'code': { name: 'code'; type: { kind: 'SCALAR'; name: 'String'; ofType: null; } }; 'createdAt': { name: 'createdAt'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; }; } }; 'currency': { name: 'currency'; type: { kind: 'SCALAR'; name: 'String'; ofType: null; } }; 'discountPct': { name: 'discountPct'; type: { kind: 'SCALAR'; name: 'Float'; ofType: null; } }; 'discountText': { name: 'discountText'; type: { kind: 'SCALAR'; name: 'String'; ofType: null; } }; 'expiresAt': { name: 'expiresAt'; type: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; } }; 'id': { name: 'id'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'item': { name: 'item'; type: { kind: 'SCALAR'; name: 'String'; ofType: null; } }; 'merchant': { name: 'merchant'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Merchant'; ofType: null; }; } }; 'price': { name: 'price'; type: { kind: 'SCALAR'; name: 'Float'; ofType: null; } }; 'startsAt': { name: 'startsAt'; type: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; } }; 'title': { name: 'title'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'url': { name: 'url'; type: { kind: 'SCALAR'; name: 'String'; ofType: null; } }; }; };
    'Float': unknown;
    'ID': unknown;
    'Int': unknown;
    'Merchant': { kind: 'OBJECT'; name: 'Merchant'; fields: { 'address': { name: 'address'; type: { kind: 'SCALAR'; name: 'String'; ofType: null; } }; 'createdAt': { name: 'createdAt'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; }; } }; 'id': { name: 'id'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'lat': { name: 'lat'; type: { kind: 'SCALAR'; name: 'Float'; ofType: null; } }; 'lng': { name: 'lng'; type: { kind: 'SCALAR'; name: 'Float'; ofType: null; } }; 'name': { name: 'name'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; }; };
    'Mutation': { kind: 'OBJECT'; name: 'Mutation'; fields: { 'addPref': { name: 'addPref'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'TrackingPref'; ofType: null; }; } }; 'removePref': { name: 'removePref'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Boolean'; ofType: null; }; } }; }; };
    'NotFoundError': { kind: 'OBJECT'; name: 'NotFoundError'; fields: { 'message': { name: 'message'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; }; };
    'PrefKind': { name: 'PrefKind'; enumValues: 'mute' | 'watchlist'; };
    'PrefScope': { name: 'PrefScope'; enumValues: 'category' | 'item'; };
    'Query': { kind: 'OBJECT'; name: 'Query'; fields: { 'deal': { name: 'deal'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'UNION'; name: 'QueryDealResult'; ofType: null; }; } }; 'deals': { name: 'deals'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'LIST'; name: never; ofType: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Deal'; ofType: null; }; }; }; } }; 'prefs': { name: 'prefs'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'LIST'; name: never; ofType: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'TrackingPref'; ofType: null; }; }; }; } }; 'stats': { name: 'stats'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Stats'; ofType: null; }; } }; }; };
    'QueryDealResult': { kind: 'UNION'; name: 'QueryDealResult'; fields: {}; possibleTypes: 'NotFoundError' | 'QueryDealSuccess' | 'ServerError'; };
    'QueryDealSuccess': { kind: 'OBJECT'; name: 'QueryDealSuccess'; fields: { 'data': { name: 'data'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'OBJECT'; name: 'Deal'; ofType: null; }; } }; }; };
    'ServerError': { kind: 'OBJECT'; name: 'ServerError'; fields: { 'message': { name: 'message'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; }; };
    'Stats': { kind: 'OBJECT'; name: 'Stats'; fields: { 'activeDeals': { name: 'activeDeals'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; 'lastIngestAt': { name: 'lastIngestAt'; type: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; } }; 'merchants': { name: 'merchants'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; 'totalDeals': { name: 'totalDeals'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; }; };
    'String': unknown;
    'TrackingPref': { kind: 'OBJECT'; name: 'TrackingPref'; fields: { 'createdAt': { name: 'createdAt'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'DateTime'; ofType: null; }; } }; 'id': { name: 'id'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'ID'; ofType: null; }; } }; 'kind': { name: 'kind'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'ENUM'; name: 'PrefKind'; ofType: null; }; } }; 'scope': { name: 'scope'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'ENUM'; name: 'PrefScope'; ofType: null; }; } }; 'value': { name: 'value'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; }; };
    'ValidationError': { kind: 'OBJECT'; name: 'ValidationError'; fields: { 'message': { name: 'message'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'String'; ofType: null; }; } }; 'status': { name: 'status'; type: { kind: 'NON_NULL'; name: never; ofType: { kind: 'SCALAR'; name: 'Int'; ofType: null; }; } }; }; };
};

/** An IntrospectionQuery representation of your schema.
 *
 * @remarks
 * This is an introspection of your schema saved as a file by GraphQLSP.
 * It will automatically be used by `gql.tada` to infer the types of your GraphQL documents.
 * If you need to reuse this data or update your `scalars`, update `tadaOutputLocation` to
 * instead save to a .ts instead of a .d.ts file.
 */
export type introspection = {
  name: never;
  query: 'Query';
  mutation: 'Mutation';
  subscription: never;
  types: introspection_types;
};

import * as gqlTada from 'gql.tada';

declare module 'gql.tada' {
  interface setupSchema {
    introspection: introspection
  }
}