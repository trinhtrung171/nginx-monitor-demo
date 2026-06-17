export function unauthorized() {
  return { error: "Unauthorized" };
}

export function notFound(entity = "Resource") {
  return { error: `${entity} not found` };
}

export function forbidden(msg = "Forbidden") {
  return { error: msg };
}
