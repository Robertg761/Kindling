export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor(message = "The idempotency key was already used for different input.") {
    super(message);
    this.name = "IdempotencyConflictError";
  }
}
