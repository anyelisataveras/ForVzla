/** Cliente Apify — run-sync-get-dataset-items (una llamada, espera resultado). */

export async function runApifyActor(token, actorId, input) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${actorId} -> ${res.status} ${await res.text()}`);
  return res.json();
}
