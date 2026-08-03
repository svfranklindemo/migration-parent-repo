/**
 * Newsletter block
 * Authorable: image, image-alt, content (RTE), button-text, toast-content,
 *             background-color, use-image-as-background, placeholder
 * On submit: slides a green toast in from the top.
 * Only authored fields are rendered.
 */

import { readBlockConfig } from '../../scripts/aem.js';

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(message) {
  const existing = document.querySelector('.newsletter-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'newsletter-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  const icon = document.createElement('span');
  icon.className = 'newsletter-toast-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"
    xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="12" fill="white"/>
    <path d="M6.5 12L10 15.5L17.5 8" stroke="#16a34a" stroke-width="2"
      stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const text = document.createElement('span');
  text.className = 'newsletter-toast-text';
  text.textContent = message;

  toast.append(icon, text);
  document.body.appendChild(toast);

  // Two rAF frames ensure the starting position is painted before transitioning
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('newsletter-toast-visible'));
  });

  setTimeout(() => {
    toast.classList.remove('newsletter-toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 4000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Read the raw innerHTML of a key-value row whose key matches `targetKey`.
 * readBlockConfig() returns text content only, so RTE cells must be grabbed
 * directly from the DOM before the block is cleared.
 */
function getRteValue(block, targetKey) {
  for (const row of block.children) {
    const [keyCell, valueCell] = row.children;
    if (
      keyCell
      && valueCell
      && keyCell.textContent.trim().toLowerCase() === targetKey.toLowerCase()
    ) {
      return valueCell.innerHTML.trim();
    }
  }
  return '';
}

// ─── Decorate ─────────────────────────────────────────────────────────────────

export default function decorate(block) {
  const config = readBlockConfig(block) || {};

  // RTE content must be grabbed before block.innerHTML is cleared
  const contentHtml = getRteValue(block, 'content');

  // ── Read authorable values (undefined / empty string = not authored) ────────
  const imageRef = (config.image ?? config['image-ref'] ?? '').trim();
  const imageAlt = (config['image-alt'] ?? config.imagealt ?? '').trim();
  const buttonText = (config['button-text'] ?? config.buttontext ?? '').trim();
  const toastContent = (config['toast-content'] ?? config.toastcontent ?? '').trim();
  const bgColor = (config['background-color'] ?? config.backgroundcolor ?? '').trim();
  const placeholder = (config.placeholder ?? '').trim();
  const useImgAsBg = String(
    config['use-image-as-background'] ?? config.useimageasbackground ?? 'false',
  ).trim().toLowerCase() === 'true';

  // ── Clear authored rows ─────────────────────────────────────────────────────
  block.innerHTML = '';

  // ── Apply block-level styles ───────────────────────────────────────────────
  if (bgColor) block.style.backgroundColor = bgColor;

  if (imageRef && useImgAsBg) {
    block.classList.add('newsletter-has-bg-image');
    block.style.backgroundImage = `url('${imageRef}')`;
  }

  // ── Wrapper ────────────────────────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'newsletter-wrapper';

  // ── Image panel (only when image is authored and NOT used as background) ───
  if (imageRef && !useImgAsBg) {
    const imagePanel = document.createElement('div');
    imagePanel.className = 'newsletter-image-panel';

    const img = document.createElement('img');
    img.src = imageRef;
    img.alt = imageAlt;
    img.loading = 'lazy';

    imagePanel.appendChild(img);
    wrapper.appendChild(imagePanel);
  }

  // ── Content panel ─────────────────────────────────────────────────────────
  const contentPanel = document.createElement('div');
  contentPanel.className = 'newsletter-content-panel';

  // RTE content (only when authored)
  if (contentHtml) {
    const contentDiv = document.createElement('div');
    contentDiv.className = 'newsletter-content';
    contentDiv.innerHTML = contentHtml;
    contentPanel.appendChild(contentDiv);
  }

  // Form (always rendered — core purpose of the block)
  const form = document.createElement('form');
  form.className = 'newsletter-form';
  form.noValidate = true;

  const inputWrapper = document.createElement('div');
  inputWrapper.className = 'newsletter-input-wrapper';

  const emailInput = document.createElement('input');
  emailInput.type = 'text';
  emailInput.name = 'email';
  emailInput.className = 'newsletter-email-input';
  emailInput.setAttribute('aria-label', 'Email address');
  if (placeholder) emailInput.placeholder = placeholder;

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'newsletter-submit-button';
  submitBtn.textContent = buttonText || 'Sign Up';

  inputWrapper.append(emailInput, submitBtn);
  form.appendChild(inputWrapper);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    showToast(toastContent || 'Thank you for subscribing!');
  });

  contentPanel.appendChild(form);
  wrapper.appendChild(contentPanel);
  block.appendChild(wrapper);
}
