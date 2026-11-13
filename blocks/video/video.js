import { readBlockConfig, resolveAnchorValue } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';

/** The block's rows when it is not key-value: one per field, in _video.json's order. */
const FIELD_ROWS = [
  'videourl',
  'autoplay',
  'loop',
  'muted',
  'controls',
  'started-event-type',
  'ended-event-type',
  'custom-class',
  'mobileimageresize',
];

function readVideoConfig(block) {
  const config = readBlockConfig(block) || {};
  if (Object.keys(config).length) return config;
  [...block.children].forEach((row, index) => {
    if (FIELD_ROWS[index]) config[FIELD_ROWS[index]] = row.textContent.trim();
  });
  return config;
}

/** @returns {boolean|undefined} the authored switch; undefined when it was never saved */
function readSwitch(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'true') return true;
  return text === 'false' ? false : undefined;
}

/**
 * An authored switch always wins. With nothing authored, a block that still carries the old
 * autoplay/playonload classes keeps behaving the way those classes have always made it behave;
 * every other block falls back to the model's defaults, which are all on.
 */
function playerSettings(block, config) {
  const background = block.classList.contains('autoplay');
  const playOnLoad = block.classList.contains('playonload');
  const legacy = background || playOnLoad;
  const fallback = (fromClasses) => (legacy ? fromClasses : true);
  return {
    autoplay: readSwitch(config.autoplay) ?? fallback(playOnLoad),
    loop: readSwitch(config.loop) ?? fallback(background),
    muted: readSwitch(config.muted) ?? fallback(background),
    controls: readSwitch(config.controls) ?? fallback(!background),
  };
}

const flag = (on) => (on ? '1' : '0');

function embedYoutube(url, settings) {
  const usp = new URLSearchParams(url.search);
  let vid = usp.get('v') || '';
  if (url.origin.includes('youtu.be')) {
    [, vid] = url.pathname.split('/');
  }
  // An /embed/ID or /shorts/ID URL carries no ?v=, so the path is kept as authored and the
  // settings are appended to it - before, they were built and then dropped for those URLs.
  const path = vid ? `/embed/${encodeURIComponent(vid)}` : url.pathname;
  const params = new URLSearchParams(vid ? { rel: '0', v: vid } : {});
  params.set('autoplay', flag(settings.autoplay));
  params.set('mute', flag(settings.muted));
  params.set('controls', flag(settings.controls));
  params.set('disablekb', flag(!settings.controls));
  params.set('loop', flag(settings.loop));
  params.set('playsinline', flag(settings.autoplay || settings.loop));
  // YouTube only loops a single video when it is also its own playlist.
  if (settings.loop && vid) params.set('playlist', vid);

  const temp = document.createElement('div');
  temp.innerHTML = `<div style="left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.25%;">
      <iframe src="https://www.youtube.com${path}?${params}" style="border: 0; top: 0; left: 0; width: 100%; height: 100%; position: absolute;" 
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope; picture-in-picture" allowfullscreen="" scrolling="no" title="Content from Youtube" loading="lazy"></iframe>
    </div>`;
  return temp.children.item(0);
}

function getVideoElement(source, settings) {
  const video = document.createElement('video');
  if (settings.controls) video.setAttribute('controls', '');
  if (settings.autoplay || settings.loop) video.setAttribute('playsinline', '');
  if (settings.loop) video.setAttribute('loop', '');
  // Muted before autoplay: browsers only autoplay a video they already know is silent.
  if (settings.muted) {
    video.setAttribute('muted', '');
    video.muted = true;
  }
  if (settings.autoplay) video.setAttribute('autoplay', '');

  const sourceEl = document.createElement('source');
  sourceEl.setAttribute('src', source);
  sourceEl.setAttribute('type', 'video/mp4');
  video.append(sourceEl);

  return video;
}

function setupVideoAnalytics(videoEl, startedEventType, endedEventType) {
  if (!videoEl) return;

  let startedDispatchedForRun = false;

  videoEl.addEventListener('play', () => {
    if (!startedEventType || startedDispatchedForRun) return;
    startedDispatchedForRun = true;
    dispatchCustomEvent(startedEventType);
  });

  videoEl.addEventListener('ended', () => {
    if (endedEventType) dispatchCustomEvent(endedEventType);
    startedDispatchedForRun = false;
  });
}

const loadVideoEmbed = (block, link, settings, startedEventType, endedEventType) => {
  const isYoutube = link.includes('youtube') || link.includes('youtu.be');
  if (isYoutube) {
    const url = new URL(link);
    const embedWrapper = embedYoutube(url, settings);
    block.append(embedWrapper);
    embedWrapper.querySelector('iframe').addEventListener('load', () => {
      block.dataset.embedLoaded = true;
    });
  } else {
    const videoEl = getVideoElement(link, settings);
    setupVideoAnalytics(videoEl, startedEventType, endedEventType);
    block.append(videoEl);
    videoEl.addEventListener('canplay', () => {
      block.dataset.embedLoaded = true;
    });
  }
};

export default function decorate(block) {
  const config = readVideoConfig(block);
  // readBlockConfig and FIELD_ROWS both key on toClassName output, so the only spellings
  // that can reach here are the lower-case, hyphenated ones.
  const authoredLink = (config.videourl || '').toString().trim();
  const fallbackAnchor = block.querySelector(':scope div:nth-child(1) > div a');
  const link = authoredLink || (fallbackAnchor ? resolveAnchorValue(fallbackAnchor).trim() : '');

  const startedEventType = (config['started-event-type'] || '').toString().trim();
  const endedEventType = (config['ended-event-type'] || '').toString().trim();

  block.textContent = '';
  block.dataset.embedLoaded = false;
  if (!link) return;
  loadVideoEmbed(block, link, playerSettings(block, config), startedEventType, endedEventType);
}
