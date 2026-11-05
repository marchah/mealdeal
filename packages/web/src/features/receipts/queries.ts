import { graphql, type ResultOf } from '../../graphql';

// Colocated, typed operations. Field selections are checked against the committed schema.

export const ReceiptsQuery = graphql(`
  query Receipts {
    appConfig {
      receiptImportEnabled
    }
    receipts {
      id
      status
      failedStage
      error
      purchasedAt
      total
      flags
      photoCount
      createdAt
      merchant {
        id
        name
      }
    }
  }
`);

export type ReceiptListItem = ResultOf<typeof ReceiptsQuery>['receipts'][number];

// urql sends a variable holding File objects as a multipart request, which Yoga reads natively.
export const UploadReceiptMutation = graphql(`
  mutation UploadReceipt($images: [File!]!) {
    uploadReceipt(images: $images) {
      __typename
      ... on MutationUploadReceiptSuccess {
        data {
          id
          status
        }
      }
      ... on ConflictError {
        message
      }
      ... on ReceiptImportDisabledError {
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

export const RetryReceiptMutation = graphql(`
  mutation RetryReceipt($id: ID!) {
    retryReceipt(id: $id) {
      __typename
      ... on MutationRetryReceiptSuccess {
        data {
          id
          status
        }
      }
      ... on ConflictError {
        message
      }
      ... on NotFoundError {
        message
      }
      ... on ReceiptImportDisabledError {
        message
      }
      ... on ServerError {
        message
      }
    }
  }
`);

export const DeleteReceiptMutation = graphql(`
  mutation DeleteReceipt($id: ID!) {
    deleteReceipt(id: $id) {
      __typename
      ... on MutationDeleteReceiptSuccess {
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
