import { readBlockConfig } from '../../scripts/aem.js';
import { normalizeAemPath } from '../../scripts/scripts.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { submitToWebhook, fetchButtonDataSheet } from '../../scripts/form-data-layer.js';
import { navigate as wizardNavigate } from '../form/components/wizard/wizard.js';

const DEFAULT_TIME_SLOTS = ['9 AM', '10 AM', '11 AM', '12 AM'];
const DEFAULT_DAYS_SHOWN = 3;
const DEFAULT_MOBILE_DAYS_SHOWN = 1;
const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const NAV_ARROW_ICON = `
  <svg viewBox="0 0 36 36" focusable="false" aria-hidden="true" role="img">
    <path fill-rule="evenodd" d="M24,18v0a1.988,1.988,0,0,1-.585,1.409l-7.983,7.98a2,2,0,1,1-2.871-2.772l.049-.049L19.181,18l-6.572-6.57a2,2,0,0,1,2.773-2.87l.049.049,7.983,7.98A1.988,1.988,0,0,1,24,18Z"></path>
  </svg>
`;

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function parseList(value, fallback) {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function applyButtonConfigToButton(button, config) {
  if (!button) return;
  const eventType = config.buttoneventtype;
  if (eventType && String(eventType).trim()) button.dataset.buttonEventType = String(eventType).trim();
  const webhookUrl = config.buttonwebhookurl;
  if (webhookUrl && String(webhookUrl).trim()) button.dataset.buttonWebhookUrl = String(webhookUrl).trim();
  const formId = config.buttonformid;
  if (formId && String(formId).trim()) button.dataset.buttonFormId = String(formId).trim();
  const buttonData = config.buttondata;
  if (buttonData && String(buttonData).trim()) button.dataset.buttonData = String(buttonData).trim();
}

async function triggerButtonTracking(button) {
  const buttonDataUrl = button?.dataset?.buttonData?.trim();
  if (buttonDataUrl && typeof window.updateDataLayer === 'function') {
    const sheetData = await fetchButtonDataSheet(normalizeAemPath(buttonDataUrl));
    if (sheetData) window.updateDataLayer(sheetData);
  }
  const eventType = button?.dataset?.buttonEventType?.trim();
  if (eventType) dispatchCustomEvent(eventType);
  const webhookUrl = button?.dataset?.buttonWebhookUrl?.trim();
  const formId = button?.dataset?.buttonFormId?.trim();
  if (webhookUrl) await submitToWebhook(null, webhookUrl, formId);
}

// ── Progress dots ─────────────────────────────────────────────────────────

function buildProgress(stepIndex, totalSteps) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ho-progress';

  const dots = document.createElement('div');
  dots.className = 'ho-progress-dots';
  for (let i = 0; i < totalSteps; i += 1) {
    const dot = document.createElement('div');
    dot.className = `ho-progress-dot${i <= stepIndex ? ' active' : ''}`;
    dots.append(dot);
  }

  const label = document.createElement('div');
  label.className = 'ho-progress-label';
  label.textContent = `${stepIndex + 1}/${totalSteps} step`;

  wrapper.append(dots, label);
  return wrapper;
}

// ── Step 1: Upload your photo ────────────────────────────────────────────

function renderStep1Content(stepEl, state) {
  const title = document.createElement('h1');
  title.className = 'ho-title';
  title.textContent = 'Upload your photo';

  const frame = document.createElement('div');
  frame.className = 'ho-photo-frame';
  frame.innerHTML = `
    <img class="ho-photo-placeholder" src="/icons/profile-image-upload.svg" alt="" aria-hidden="true">
  `;

  const cameraInput = document.createElement('input');
  cameraInput.type = 'file';
  cameraInput.accept = 'image/*';
  cameraInput.capture = 'user';
  cameraInput.className = 'ho-visually-hidden';

  const galleryInput = document.createElement('input');
  galleryInput.type = 'file';
  galleryInput.accept = 'image/*';
  galleryInput.className = 'ho-visually-hidden';

  const onFileChosen = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.photo = reader.result;
      frame.querySelector('.ho-photo-placeholder')?.remove();
      frame.querySelectorAll('img.ho-photo-preview').forEach((img) => img.remove());
      const img = document.createElement('img');
      img.className = 'ho-photo-preview';
      img.src = reader.result;
      img.alt = 'Uploaded photo preview';
      frame.append(img);
    };
    reader.readAsDataURL(file);
  };

  cameraInput.addEventListener('change', () => onFileChosen(cameraInput.files?.[0]));
  galleryInput.addEventListener('change', () => onFileChosen(galleryInput.files?.[0]));

  const takePhotoBtn = document.createElement('button');
  takePhotoBtn.type = 'button';
  takePhotoBtn.className = 'ho-btn ho-btn-primary';
  takePhotoBtn.textContent = 'Take a Photo';
  takePhotoBtn.addEventListener('click', () => cameraInput.click());

  const galleryBtn = document.createElement('button');
  galleryBtn.type = 'button';
  galleryBtn.className = 'ho-link-btn';
  galleryBtn.textContent = 'Or choose from the gallery';
  galleryBtn.addEventListener('click', () => galleryInput.click());

  stepEl.append(title, frame, cameraInput, galleryInput, takePhotoBtn, galleryBtn);
}

// ── Step 2: Schedule 1st check-up ────────────────────────────────────────

function buildSlotPicker(config, state) {
  const dailyOptions = parseList(config['time-slots'], DEFAULT_TIME_SLOTS);
  let daysShown = parseInt(config['days-shown'], 10) || DEFAULT_DAYS_SHOWN;
  const mobileDaysShown = parseInt(config['mobile-days-shown'], 10) || DEFAULT_MOBILE_DAYS_SHOWN;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const slotData = {};

  if (window.innerWidth < 900) {
    daysShown = mobileDaysShown;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'ho-slot-picker';

  const content = document.createElement('div');
  content.className = 'ho-slot-picker-content';

  const prevBtn = document.createElement('button');
  prevBtn.type = 'button';
  prevBtn.className = 'ho-slot-nav ho-slot-nav-prev';
  prevBtn.setAttribute('aria-label', 'Previous days');
  prevBtn.innerHTML = NAV_ARROW_ICON;

  const columnsEl = document.createElement('div');
  columnsEl.className = 'ho-slot-columns';

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'ho-slot-nav';
  nextBtn.setAttribute('aria-label', 'Next days');
  nextBtn.innerHTML = NAV_ARROW_ICON;

  content.append(prevBtn, columnsEl, nextBtn);
  wrapper.append(content);

  let dateOffset = 0;

  function getOrCreateDayData(date) {
    const key = date.toDateString();
    if (!slotData[key]) {
      slotData[key] = {
        key,
        dayName: SHORT_DAY_NAMES[date.getDay()],
        day: date.getDate(),
        monthName: SHORT_MONTH_NAMES[date.getMonth()],
        options: dailyOptions.map((opt) => ({
          value: `${key} - ${opt}`,
          label: opt,
          disabled: Math.random() > 0.7,
        })),
      };
    }
    return slotData[key];
  }

  function render() {
    columnsEl.innerHTML = '';
    for (let i = 0; i < daysShown; i += 1) {
      const date = addDays(today, dateOffset + i);
      const col = getOrCreateDayData(date);

      const colEl = document.createElement('div');
      colEl.className = 'ho-slot-column';

      const header = document.createElement('div');
      header.className = 'ho-slot-col-header';
      header.innerHTML = `<strong>${col.dayName}</strong><em>${col.day} ${col.monthName}</em>`;
      colEl.append(header);

      col.options.forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = opt.label;
        btn.className = 'ho-slot-option'
          + (opt.disabled ? ' is-disabled' : '')
          + (state.selectedSlot === opt.value ? ' is-selected' : '');
        if (!opt.disabled) {
          btn.addEventListener('click', () => {
            state.selectedSlot = opt.value;
            render();
          });
        }
        colEl.append(btn);
      });

      columnsEl.append(colEl);
    }
    prevBtn.disabled = dateOffset <= 0;
  }

  prevBtn.addEventListener('click', () => { dateOffset = Math.max(0, dateOffset - daysShown); render(); });
  nextBtn.addEventListener('click', () => { dateOffset += daysShown; render(); });

  render();
  return wrapper;
}

function renderStep2Content(stepEl, state, config) {
  const title = document.createElement('h2');
  title.className = 'ho-title';
  title.textContent = 'Schedule 1st check-up';

  const card = document.createElement('div');
  card.className = 'ho-doctor-card';
  const rating = 5;
  const doctorPhoto = '/content/dam/we-healthcare/en/images/doctors/dr-verma-md.png';
  card.innerHTML = `
    <div class="ho-doctor-photo"><img src="${doctorPhoto}" alt="Doctor"></div>
    <div class="ho-doctor-info">
      <div class="ho-doctor-rating" aria-label="${rating} out of 5 stars">${'★'.repeat(rating)}</div>
      <p class="ho-doctor-title">Doctor</p>
      <p class="ho-doctor-name">Dr. Verma, MD</p>
      <a class="ho-doctor-profile-link" href="#">Doctor's Profile</a>
    </div>
  `;

  const pickDateLabel = document.createElement('p');
  pickDateLabel.className = 'ho-pick-date-label';
  pickDateLabel.textContent = 'Pick the date';

  const slotPicker = buildSlotPicker(config, state);

  stepEl.append(title, card, pickDateLabel, slotPicker);
}

// ── Step 3: Transfer Prescriptions ───────────────────────────────────────

function renderStep3Content(stepEl, state, config) {
  const title = document.createElement('h2');
  title.className = 'ho-title';
  title.textContent = 'Transfer Prescriptions';

  const signIframeUrl = config['sign-iframe-url'] || 'https://adobe.na1.documents.adobe.com/public/esignWidget?wid=CBFCIBAA3AAABLblqZhCCoM_XFoE3aMHQVYRZyFcK9NUeu99cy1cOZBgpNiHJRA3GJm9Vp6qQIIc_oAvmbr4*&hosted=false';

  const panel = document.createElement('div');
  panel.className = 'ho-sign-panel';
  panel.innerHTML = `
    <div class="ho-sign-body">
      <iframe class="ho-sign-iframe" title="iframe" src="${signIframeUrl}" width="100%" height="100%" frameborder="0"></iframe>
    </div>
  `;

  stepEl.append(title, panel);
}

// ── Step 4: Enroll in Wellness Program ───────────────────────────────────

function renderStep4Content(stepEl) {
  const title = document.createElement('h2');
  title.className = 'ho-title';
  title.textContent = 'Enroll in Wellness Program';

  const image = document.createElement('img');
  image.className = 'ho-wellness-image';
  image.src = '/content/dam/we-healthcare/en/images/we-healthcare-mobile-home.jpg';
  image.alt = '';

  stepEl.append(title, image);
}

// ── Step 5: Onboarding complete ──────────────────────────────────────────

function renderComplete(config) {
  const step = document.createElement('div');
  step.className = 'ho-step ho-step-complete';

  const title = document.createElement('h1');
  title.className = 'ho-title';
  title.textContent = 'Onboarding complete';

  const message = document.createElement('p');
  message.className = 'ho-complete-text';
  message.textContent = 'Thank you for completing the onboarding process. You should receive an email with summary and a link to a mobile app which will assist in your Wellness Program.';

  const proceed = document.createElement('p');
  proceed.className = 'ho-complete-text';
  proceed.textContent = 'Proceed to Member Resources to schedule additional appointments and get more information.';

  const memberResourcesBtn = document.createElement('a');
  memberResourcesBtn.className = 'ho-btn ho-btn-primary';
  memberResourcesBtn.href = config['member-resources-url'] || '#';
  memberResourcesBtn.textContent = 'Member Resources';

  step.append(title, message, proceed, memberResourcesBtn);
  return step;
}

// ── Adaptive Form Block (AFB) wizard definition ──────────────────────────

function buildFormDef() {
  const emptyStep = (id) => ({
    id, name: id, fieldType: 'panel', items: [],
  });

  return {
    id: 'healthcare-onboarding-form',
    fieldType: 'form',
    appliedCssClassNames: 'healthcare-onboarding-form is-wizard',
    items: [
      {
        id: 'ho-wizard',
        name: 'wizard',
        fieldType: 'panel',
        ':type': 'fd/panel/wizard',
        items: [
          emptyStep('ho-step-1'),
          emptyStep('ho-step-2'),
          emptyStep('ho-step-3'),
          {
            id: 'ho-step-4',
            name: 'ho-step-4',
            fieldType: 'panel',
            items: [
              {
                id: 'ho-submit-btn',
                name: 'confirmEnrollment',
                fieldType: 'button',
                buttonType: 'submit',
                label: { value: 'Confirm Enrollment' },
                appliedCssClassNames: 'submit-wrapper',
              },
            ],
          },
        ],
      },
    ],
  };
}

// ── Wizard wiring: progress dots, Next-button gating, submit ────────────

function setupWizard(block, config, state) {
  const form = block.querySelector('form');
  const wizardPanel = block.querySelector('.wizard');
  if (!form || !wizardPanel) return;

  // must stay in the DOM (hidden via CSS): WizardLayout.navigate() reads its active menu item internally
  block.querySelector('.wizard-button-prev')?.remove();

  const progressHolder = document.createElement('div');
  block.insertBefore(progressHolder, block.firstChild);

  const getCurrentIndex = () => {
    const current = wizardPanel.querySelector('.current-wizard-step');
    return current ? parseInt(current.dataset.index, 10) : 0;
  };

  const nextLabels = ['Next', 'Schedule Appointment', 'Enroll in Wellness Program'];

  const nextWrapperOld = wizardPanel.querySelector('.wizard-button-next');
  const nextWrapper = nextWrapperOld.cloneNode(true);
  nextWrapperOld.replaceWith(nextWrapper);
  const nextBtn = nextWrapper.querySelector('button');
  nextBtn.classList.add('ho-btn', 'ho-btn-primary', 'ho-btn-next');

  const syncUI = () => {
    const idx = getCurrentIndex();
    progressHolder.replaceChildren(buildProgress(idx, 4));
    if (nextLabels[idx]) nextBtn.textContent = nextLabels[idx];
  };

  nextWrapper.addEventListener('click', () => {
    wizardNavigate(wizardPanel, true);
  });

  wizardPanel.addEventListener('wizard:navigate', syncUI);
  syncUI();

  const submitBtn = form.querySelector("button[type='submit']");
  applyButtonConfigToButton(submitBtn, config);
  submitBtn.classList.add('ho-btn', 'ho-btn-primary', 'ho-btn-confirm');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await triggerButtonTracking(submitBtn);
    block.replaceChildren(renderComplete(config));
  });
}

// ── decorate ──────────────────────────────────────────────────────────────

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  block.textContent = '';

  const customClass = config['custom-class']?.trim();
  if (customClass) block.classList.add(...customClass.split(/\s+/));

  const state = {
    photo: null,
    selectedSlot: '',
    signed: false,
  };

  const formDef = buildFormDef();
  const formContainer = document.createElement('div');
  formContainer.className = 'form-container';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);

  block.append(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  setTimeout(() => {
    const step1 = document.getElementById('ho-step-1');
    const step2 = document.getElementById('ho-step-2');
    const step3 = document.getElementById('ho-step-3');
    const step4 = document.getElementById('ho-step-4');

    step1.classList.add('ho-step', 'ho-step-photo');
    renderStep1Content(step1, state);

    step2.classList.add('ho-step', 'ho-step-schedule');
    renderStep2Content(step2, state, config);

    step3.classList.add('ho-step', 'ho-step-transfer');
    renderStep3Content(step3, state, config);

    step4.classList.add('ho-step', 'ho-step-wellness');
    const submitBtnWrapper = step4.querySelector('.submit-wrapper');
    renderStep4Content(step4);
    // the submit button only becomes visible (via CSS) once it's inside the shared wizard-button-wrapper
    block.querySelector('.wizard-button-wrapper')?.append(submitBtnWrapper);

    setupWizard(block, config, state);
  }, 100);
}
