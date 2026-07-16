// Typed error hierarchy. A service throws one of these to signal a domain outcome;
// a resolver that lists the matching type in `errors: { types: [...] }` surfaces it to
// the client as a member of the field's result union (see builder.ts). Plain throws
// (not listed) become generic GraphQL errors.
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {}
export class ValidationError extends AppError {}
export class ForbiddenError extends AppError {}
export class ConflictError extends AppError {}
export class ServerError extends AppError {}
