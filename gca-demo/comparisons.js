// Install each verified pair once; keep the current animations uninterrupted.
const comparisons = document.querySelector('#comparisons');
function timingRow(times) {
  const row = document.createElement('div');
  row.className = 'timings';
  const label = document.createElement('span');
  label.className = 'timing-label';
  label.textContent = 'Denoising time';
  row.append(label);
  for (const [method, name] of [['dense', 'Dense attention'], ['gca', 'GCA']]) {
    const seconds = Math.round(times[method]);
    const value = document.createElement('span');
    value.textContent = `${name} · ${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
    row.append(value);
  }
  return row;
}
async function loadComparisons() {
  try {
    const [response, timingResponse] = await Promise.all([
      fetch('media/comparisons-ready.json', { cache: 'no-store' }),
      fetch('timings.json', { cache: 'no-store' })
    ]);
    if (!response.ok || !timingResponse.ok) throw new Error('Comparisons are not ready');
    const [{ items, complete }, { items: timings }] = await Promise.all([response.json(), timingResponse.json()]);
    const originalTimings = document.querySelector('#tokyo-timings');
    if (!originalTimings.hasChildNodes()) originalTimings.append(timingRow(timings.tokyo));
    for (const item of items) {
      const previous = document.getElementById(`comparison-${item.slug}`);
      if (previous?.dataset.gif === item.gif) continue;
      const figure = document.createElement('figure');
      figure.id = `comparison-${item.slug}`;
      figure.dataset.gif = item.gif;
      const caption = document.createElement('figcaption');
      caption.textContent = item.label;
      const picture = document.createElement('picture');
      const source = document.createElement('source');
      source.media = '(prefers-reduced-motion: reduce)';
      source.srcset = item.poster;
      const image = document.createElement('img');
      Object.assign(image, { src: item.gif, alt: `${item.label}: Dense and GCA videos playing throughout denoising.`,
        width: 1088, height: 400, loading: 'lazy' });
      picture.append(source, image);
      figure.append(caption, picture);
      if (item.timings || timings[item.slug]) figure.append(timingRow(item.timings || timings[item.slug]));
      if (previous) previous.replaceWith(figure);
      else comparisons.append(figure);
    }
    if (complete) return;
  } catch (_) { /* Keep displaying completed pairs during export or reconnect. */ }
  setTimeout(loadComparisons, 30000);
}
loadComparisons();
