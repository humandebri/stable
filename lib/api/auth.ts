const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET;

export function assertInternalRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && (fetchSite === "same-origin" || fetchSite === "same-site")) {
    return;
  }

  if (!INTERNAL_API_SECRET) {
    throw new Error(
      "INTERNAL_API_SECRET is not set. Configure an internal API key to protect server routes."
    );
  }

  const provided =
    request.headers.get("x-internal-api-key") ??
    request.headers.get("x-api-key");

  if (provided !== INTERNAL_API_SECRET) {
    throw new Error("Forbidden");
  }
}
