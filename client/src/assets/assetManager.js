import { fetchJson, loadImage, loadAudio, loadJson } from './loader.js';

export async function loadAll({
  manifestUrl = '/assets-manifest.json',
  audioContext,
  signal,
  onProgress = () => {},
} = {}) {
  // Завантажуємо маніфест.
  const manifest = await fetchJson(manifestUrl, { signal });

  const resources = [
    ...Object.entries(manifest.images ?? {}).map(([name, url]) => ({
      type: 'image',
      name,
      url,
    })),
    ...Object.entries(manifest.audio ?? {}).map(([name, url]) => ({
      type: 'audio',
      name,
      url,
    })),
    ...Object.entries(manifest.json ?? {}).map(([name, url]) => ({
      type: 'json',
      name,
      url,
    })),
  ];

  const total = resources.length;
  let completed = 0;

  const images = {};
  const audio = {};
  const json = {};

  onProgress({
    loaded: 0,
    total,
    percent: 0,
    current: 'Підготовка ресурсів',
    failed: 0,
  });

  // Паралельне завантаження ресурсів.
  const tasks = resources.map(async (resource) => {
    let status = 'loaded';

    try {
      let result;

      switch (resource.type) {
        case 'image':
          result = await loadImage(resource.url, { signal });
          images[resource.name] = result;
          break;

        case 'audio':
          result = await loadAudio(resource.url, {
            signal,
            audioContext,
          });
          audio[resource.name] = result;
          break;

        case 'json':
          result = await loadJson(resource.url, { signal });
          json[resource.name] = result;
          break;

        default:
          throw new Error(`Unknown resource type: ${resource.type}`);
      }

      return result;
    } catch (error) {
      status = 'failed';
      throw error;
    } finally {
      completed++;

      const failed =
        resources.length -
        Object.keys(images).length -
        Object.keys(audio).length -
        Object.keys(json).length;

      onProgress({
        loaded: completed,
        total,
        percent: total === 0 ? 100 : Math.round((completed / total) * 100),
        current: resource.name,
        type: resource.type,
        status,
        failed,
      });
    }
  });

  // Чекаємо завершення всіх завантажень.
  const results = await Promise.allSettled(tasks);

  const errors = results
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason);

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Не вдалося завантажити всі ресурси');
  }

  return {
    manifest,
    images,
    audio,
    json,
  };
}
