import { graphql } from '../../graphql';
import type { Maybe } from '../../lib/types';

// Colocated, typed operations. Field selections are checked against the committed schema.

export const PantryItemsQuery = graphql(`
  query PantryItems($includeArchived: Boolean!) {
    pantryItems(includeArchived: $includeArchived) {
      id
      name
      brand
      imageUrl
      sizeAmount
      sizeUnit
      unitPriceUnit
      targetPrice
      archived
      category {
        id
        key
        label
      }
      insight {
        verdict
        observationCount
        formattedLatestUnitPrice
        latestUnitPrice
        lowestUnitPrice
        medianUnitPrice
        highestUnitPrice
        savingsVsMedianPct
        meetsTargetPrice
        displayUnit
        currency
        cheapestMerchant {
          id
          name
        }
        latest {
          id
          price
          currency
          observedAt
        }
      }
      priceEntries(limit: 40) {
        id
        unitPrice
        observedAt
      }
    }
    getCouponTypes {
      id
      key
      label
    }
  }
`);

export const PantryItemQuery = graphql(`
  query PantryItemDetail($id: ID!) {
    pantryItem(id: $id) {
      __typename
      ... on QueryPantryItemSuccess {
        data {
          id
          name
          brand
          imageUrl
          notes
          sizeAmount
          sizeUnit
          unitPriceUnit
          targetPrice
          archived
          couponTypeId
          category {
            id
            key
            label
          }
          insight {
            verdict
            windowDays
            observationCount
            formattedLatestUnitPrice
            latestUnitPrice
            lowestUnitPrice
            medianUnitPrice
            highestUnitPrice
            savingsVsMedianPct
            meetsTargetPrice
            displayUnit
            currency
            cheapestMerchant {
              id
              name
            }
            latest {
              id
              price
              currency
              observedAt
            }
          }
          priceEntries {
            id
            price
            currency
            sizeAmount
            sizeUnit
            quantity
            unitPrice
            displayUnitPrice
            formattedUnitPrice
            onSale
            note
            url
            observedAt
            merchant {
              id
              name
            }
          }
        }
      }
      ... on NotFoundError {
        message
      }
      ... on ServerError {
        message
      }
    }
    getCouponTypes {
      id
      key
      label
    }
  }
`);

export const AddPantryItemMutation = graphql(`
  mutation AddPantryItem($input: PantryItemInput!) {
    addPantryItem(input: $input) {
      __typename
      ... on MutationAddPantryItemSuccess {
        data {
          id
        }
      }
      ... on ConflictError {
        message
      }
      ... on NotFoundError {
        message
      }
      ... on ValidationError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

export const UpdatePantryItemMutation = graphql(`
  mutation UpdatePantryItem($id: ID!, $input: PantryItemInput!) {
    updatePantryItem(id: $id, input: $input) {
      __typename
      ... on MutationUpdatePantryItemSuccess {
        data {
          id
        }
      }
      ... on ConflictError {
        message
      }
      ... on NotFoundError {
        message
      }
      ... on ValidationError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

export const ArchivePantryItemMutation = graphql(`
  mutation ArchivePantryItem($id: ID!, $archived: Boolean!) {
    archivePantryItem(id: $id, archived: $archived) {
      __typename
      ... on MutationArchivePantryItemSuccess {
        data {
          id
          archived
        }
      }
      ... on NotFoundError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

export const DeletePantryItemMutation = graphql(`
  mutation DeletePantryItem($id: ID!) {
    deletePantryItem(id: $id) {
      __typename
      ... on MutationDeletePantryItemSuccess {
        data {
          id
        }
      }
      ... on NotFoundError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

export const AddPriceEntryMutation = graphql(`
  mutation AddPriceEntry($input: PriceEntryInput!) {
    addPriceEntry(input: $input) {
      __typename
      ... on MutationAddPriceEntrySuccess {
        data {
          id
        }
      }
      ... on ConflictError {
        message
      }
      ... on NotFoundError {
        message
      }
      ... on ValidationError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

export const DeletePriceEntryMutation = graphql(`
  mutation DeletePriceEntry($id: ID!) {
    deletePriceEntry(id: $id) {
      __typename
      ... on MutationDeletePriceEntrySuccess {
        data {
          id
        }
      }
      ... on NotFoundError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

/** Every mutation answers with a result union; this is the one place that shape is unwrapped. */
export function mutationError(result: { __typename: string; message?: string }): Maybe<string> {
  return result.__typename.endsWith('Success') ? null : (result.message ?? 'Something went wrong');
}
