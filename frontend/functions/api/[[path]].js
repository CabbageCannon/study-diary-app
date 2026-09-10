export function onRequest({ request }) {
  const url = new URL(request.url);
  return fetch(new Request(new URL(`${url.pathname}${url.search}`, "https://study-diary-api.onrender.com"), request));
}
