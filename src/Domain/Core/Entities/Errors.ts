/**
 * Errors the use cases and repositories throw on purpose. The entry points
 * turn them into their HTTP status; anything else is a 500.
 */
export class AppError extends Error {
  constructor(public status: number, message: string, public details?: string[]) {
    super(message);
    this.name = new.target.name;
  }
}

/** 400: the request itself is wrong (missing field, invalid value). */
export class ValidationError extends AppError {
  constructor(message: string, details?: string[]) {
    super(400, message, details);
  }
}

/** 403: the user is authenticated but has no right to do this (LAB-NF-05). */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Experiment not found.") {
    super(404, message);
  }
}

/** 409: the action is not allowed in the current state (LAB-EX-03, LAB-EX-07). */
export class ConflictError extends AppError {
  constructor(message: string, details?: string[]) {
    super(409, message, details);
  }
}
