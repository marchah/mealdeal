import SchemaBuilder from '@pothos/core';
import ErrorsPlugin from '@pothos/plugin-errors';
import ZodPlugin from '@pothos/plugin-zod';
import { DateTimeResolver } from 'graphql-scalars';
import {
  ConflictError,
  LocationLookupError,
  LocationNotConfiguredError,
  LocationNotFoundError,
  NotFoundError,
  ReceiptImportDisabledError,
  ServerError,
  ValidationError,
} from './common/errors';
import type { YogaContext } from './context';

// The single Pothos schema builder for the whole API. Modules import `builder` and
// register their types/fields against it; schema.ts assembles them into the executable
// schema. Context is the request-scoped object built in context.ts.
export const builder = new SchemaBuilder<{
  Context: YogaContext;
  DefaultFieldNullability: false;
  Scalars: {
    DateTime: { Input: Date; Output: Date };
    File: { Input: File; Output: never };
    ID: { Input: string; Output: string };
  };
}>({
  plugins: [ErrorsPlugin, ZodPlugin],
  // Precise nullability: fields are non-null by default; opt into `nullable: true` per field.
  defaultFieldNullability: false,
  // ServerError is the catch-all: any field with `errors:` also surfaces unexpected server
  // errors as a typed union member. More specific types listed on a field match first.
  errors: { defaultTypes: [ServerError] },
  zod: {
    validationError: (zodError) =>
      new ValidationError(zodError.issues.map((issue) => issue.message).join('; ')),
  },
});

builder.addScalarType('DateTime', DateTimeResolver, {});
// Yoga hands a multipart request's files to resolvers as File objects (graphql-multipart-request-spec).
builder.scalarType('File', {
  description: 'A file sent in a multipart request. Input only.',
  serialize: () => {
    throw new Error('File is an input-only scalar');
  },
});
builder.queryType({});
builder.mutationType({});

// Register the error classes as GraphQL object types so fields may list them in
// `errors: { types: [...] }` and thrown instances surface as result-union members — each
// exposing the HTTP-style status + message from common/errors.ts.
builder.objectType(ServerError, {
  name: 'ServerError',
  fields: (t) => ({ message: t.exposeString('message'), status: t.exposeInt('status') }),
});
builder.objectType(NotFoundError, {
  name: 'NotFoundError',
  fields: (t) => ({ message: t.exposeString('message'), status: t.exposeInt('status') }),
});
builder.objectType(ValidationError, {
  name: 'ValidationError',
  fields: (t) => ({ message: t.exposeString('message'), status: t.exposeInt('status') }),
});
builder.objectType(ConflictError, {
  name: 'ConflictError',
  fields: (t) => ({ message: t.exposeString('message'), status: t.exposeInt('status') }),
});
builder.objectType(LocationNotConfiguredError, {
  name: 'LocationNotConfiguredError',
  fields: (t) => ({ message: t.exposeString('message'), status: t.exposeInt('status') }),
});
builder.objectType(LocationNotFoundError, {
  name: 'LocationNotFoundError',
  fields: (t) => ({ message: t.exposeString('message'), status: t.exposeInt('status') }),
});
builder.objectType(LocationLookupError, {
  name: 'LocationLookupError',
  fields: (t) => ({ message: t.exposeString('message'), status: t.exposeInt('status') }),
});
builder.objectType(ReceiptImportDisabledError, {
  name: 'ReceiptImportDisabledError',
  fields: (t) => ({ message: t.exposeString('message'), status: t.exposeInt('status') }),
});
