import { readBlockConfig } from '../../scripts/aem.js';
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

/** A switch that was never saved keeps what the block's classes have always done. */
function playerSettings(block, config) {
  const background = block.classList.contains('autoplay');
  return {
    autoplay: readSwitch(config.autoplay) ?? block.classList.contains('playonload'),
    loop: readSwitch(config.loop) ?? background,
    muted: readSwitch(config.muted) ?? background,
    controls: readSwitch(config.controls) ?? !background,
  };
}

function embedYoutube(url, settings) {
  const usp = new URLSearchParams(url.search);
  let vid = usp.get('v') ? encodeURIComponent(usp.get('v')) : '';
  const embed = url.pathname;
  if (url.origin.includes('youtu.be')) {
    [, vid] = url.pathname.split('/');
  }
  const suffixParams = {
    autoplay: settings.autoplay ? '1' : '0',
    mute: settings.muted ? '1' : '0',
    controls: settings.controls ? '1' : '0',
    disablekb: settings.controls ? '0' : '1',
    loop: settings.loop ? '1' : '0',
    playsinline: settings.autoplay || settings.loop ? '1' : '0',
    // YouTube only loops a single video when it is also its own playlist.
    ...(settings.loop && vid ? { playlist: vid } : {}),
  };
  const suffix = `&${Object.entries(suffixParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;

  const temp = document.createElement('div');
  temp.innerHTML = `<div style="left: 0; width: 100%; height: 0; position: relative; padding-bottom: 56.25%;">
      <iframe src="https://www.youtube.com${vid ? `/embed/${vid}?rel=0&v=${vid}${suffix}` : embed}" style="border: 0; top: 0; left: 0; width: 100%; height: 100%; position: absolute;" 
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
  const authoredLink = (config.videourl || config.videoUrl || '').toString().trim();
  const fallbackLink = block.querySelector(':scope div:nth-child(1) > div a')?.innerHTML?.trim() || '';
  const link = authoredLink || fallbackLink;

  const startedEventType = (config['started-event-type'] || config.startedeventtype || '').toString().trim();
  const endedEventType = (config['ended-event-type'] || config.endedeventtype || '').toString().trim();

  block.textContent = '';
  block.dataset.embedLoaded = false;
  if (!link) return;
  loadVideoEmbed(block, link, playerSettings(block, config), startedEventType, endedEventType);
}
