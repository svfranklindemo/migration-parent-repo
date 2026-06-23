import { readBlockConfig, loadCSS } from '../../scripts/aem.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { syncFormDataLayer, DEFAULT_FORM_FIELD_MAP, submitToWebhook } from '../../scripts/form-data-layer.js';
import { normalizeAemPath } from '../../scripts/scripts.js';

/**
 * Constructs the 3-Step Wizard Form Definition
 */
function buildBinjiRegistrationFormDef() {
  return {
    id: 'binji-registration-form',
    fieldType: 'form',
    appliedCssClassNames: 'binji-registration__form binji-registration__wizard',
    items: [
      {
        id: 'panel-wizard',
        name: 'wizard',
        fieldType: 'panel',
        ':type': 'fd/panel/wizard',
        items: [
          /* --- STEP 1: EMAIL --- */
          {
            id: 'step-1-email',
            name: 'step1',
            fieldType: 'panel',
            items: [
              { id: 'step-1-ind', fieldType: 'heading', label: { value: 'STEP 1 OF 3' }, appliedCssClassNames: 'binji-registration__step-indicator col-12' },
              { id: 'step-1-title', fieldType: 'heading', label: { value: 'Enter your email address' }, appliedCssClassNames: 'binji-registration__title col-12' },
              { id: 'step-1-sub', fieldType: 'heading', label: { value: 'You will use this email and password to log into your Binji+ account to watch your favourite shows and movies.' }, appliedCssClassNames: 'binji-registration__subtitle col-12' },
              { id: 'email', name: 'email', fieldType: 'text-input', placeholder: 'Email', properties: { colspan: 12 }, appliedCssClassNames: 'binji-registration__input col-12' },
              { id: 'step-1-terms', fieldType: 'heading', label: { value: 'Binji+ will use your data to personalize and improve your Binji+ experience and to send you information about Binji+. You can change your communication preferences at any time. By clicking "Next" you are agreeing to our Subscriber Agreement and acknowledging that you have read our Privacy Policy.' }, appliedCssClassNames: 'binji-registration__disclaimer col-12' },
              { id: 'marketingConsent', name: 'marketingConsent', fieldType: 'checkbox', label: { value: 'Yes, I would like to receive special offers and updates about Binji+ and other products by email.' }, properties: { variant: 'switch', colspan: 12 }, appliedCssClassNames: 'binji-registration__switch col-12' }
            ],
          },
          /* --- STEP 2: PASSWORD --- */
          {
            id: 'step-2-password',
            name: 'step2',
            fieldType: 'panel',
            items: [
              { id: 'step-2-ind', fieldType: 'heading', label: { value: 'STEP 2 OF 3' }, appliedCssClassNames: 'binji-registration__step-indicator col-12' },
              { id: 'step-2-title', fieldType: 'heading', label: { value: 'Create a password' }, appliedCssClassNames: 'binji-registration__title col-12' },
              { id: 'step-2-sub', fieldType: 'heading', label: { value: 'You will use this email and password to log into your Binji+ account to watch your favourite shows and movies.' }, appliedCssClassNames: 'binji-registration__subtitle col-12' },
              { id: 'password', name: 'password', fieldType: 'text-input', type: 'password', placeholder: '***', properties: { colspan: 12 }, appliedCssClassNames: 'binji-registration__input col-12' },
              { id: 'step-2-rules', fieldType: 'heading', label: { value: 'Use a minimum of 6 characters with at least one number or special character.' }, appliedCssClassNames: 'binji-registration__disclaimer col-12' }
            ],
          },
          /* --- STEP 3: PAYMENT & SUBMIT --- */
          {
            id: 'step-3-payment',
            name: 'step3',
            fieldType: 'panel',
            items: [
              { id: 'step-3-title', fieldType: 'heading', label: { value: 'Start streaming today' }, appliedCssClassNames: 'binji-registration__title col-12' },
              { id: 'step-3-sub', fieldType: 'heading', label: { value: 'Endless stories for just $10.99/month. Cancel at any time, effective at the end of the payment period.' }, appliedCssClassNames: 'binji-registration__subtitle col-12' },
              { id: 'cardName', name: 'cardName', fieldType: 'text-input', label: { value: 'NAME ON CARD' }, properties: { colspan: 12 }, appliedCssClassNames: 'binji-registration__input col-12' },
              { id: 'cardNumber', name: 'cardNumber', fieldType: 'text-input', label: { value: 'CARD NUMBER' }, properties: { colspan: 12 }, appliedCssClassNames: 'binji-registration__input col-12' },
              { id: 'cardExpiry', name: 'cardExpiry', fieldType: 'text-input', label: { value: 'EXPIRATION DATE' }, placeholder: 'MM/YY', properties: { colspan: 6 }, appliedCssClassNames: 'binji-registration__input' },
              { id: 'cardCvv', name: 'cardCvv', fieldType: 'text-input', label: { value: 'SECURITY CODE' }, placeholder: 'CVV', properties: { colspan: 4 }, appliedCssClassNames: 'binji-registration__input col-4' },
              { id: 'trialConsent', name: 'trialConsent', fieldType: 'checkbox', label: { value: 'I want to start with a free 30 days trial. I won’t be charged for my first month of use.' }, properties: { variant: 'switch', colspan: 12 }, appliedCssClassNames: 'binji-registration__switch col-12' },
              { id: 'step-3-terms', fieldType: 'heading', label: { value: 'Binji+ will use your data to personalize and improve your Binji+ experience and to send you information about Binji+. You can change your communication preferences at any time. By clicking "Submit" you are agreeing to our Subscriber Agreement and acknowledging that you have read our Privacy Policy.' }, appliedCssClassNames: 'binji-registration__disclaimer col-12' },
              { id: 'submit-application-btn', name: 'submitApplication', fieldType: 'button', buttonType: 'submit', label: { value: 'Submit' }, appliedCssClassNames: 'binji-registration__submit-btn col-12' }
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Handles dot navigation indicators natively.
 */
function setupWizardStepIndicator(block) {
  const wizard = block.querySelector('form .wizard');
  if (!wizard) return;
  
  const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
  const btnWrapper = wizard.querySelector('.wizard-button-wrapper');
  if (!btnWrapper || totalSteps === 0) return;

  // Build Dots UI
  const progressWrapper = document.createElement('div');
  progressWrapper.className = 'binji-registration__progress-wrapper';
  
  const dotsContainer = document.createElement('div');
  dotsContainer.className = 'binji-registration__dots';
  
  for (let i = 0; i < totalSteps; i++) {
    const dot = document.createElement('div');
    dot.className = 'binji-registration__dot';
    dotsContainer.appendChild(dot);
  }
  progressWrapper.appendChild(dotsContainer);

  const updateDots = () => {
    const current = wizard.querySelector('.current-wizard-step');
    const idx = current ? parseInt(current.dataset.index, 10) : 0;
    const dots = dotsContainer.querySelectorAll('.binji-registration__dot');
    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i <= idx);
    });
  };
  
  updateDots();
  wizard.addEventListener('wizard:navigate', updateDots);

  // Re-arrange DOM for Binji layout: Back (Left), Dots (Center), Next/Submit (Right)
  const nextBtn = btnWrapper.querySelector('.wizard-button-next, [id*="wizard-button-next"]');
  if (nextBtn) btnWrapper.insertBefore(progressWrapper, nextBtn);

  const submitWrapper = wizard.querySelector('.submit-wrapper');
  if (submitWrapper) btnWrapper.appendChild(submitWrapper);
}

/**
 * Registration Payload Submission Logic
 */
function attachRegistrationSubmitHandler(block, config) {
  const form = block.querySelector('form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {};
    form.querySelectorAll('input, select, textarea').forEach((el) => {
      const name = el.getAttribute('name');
      if (name) data[name] = el.type === 'checkbox' ? el.checked : el.value;
    });

    try {
      const userId = `binji_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const registrationData = { ...data, registeredAt: new Date().toISOString(), userId };

      // Local Identity Mapping (matching legacy create-account logic)
      if (data.email) {
        localStorage.setItem("com.adobe.reactor.dataElements.Identities", JSON.stringify({ Email: [{ id: data.email, primary: true }] }));
        localStorage.setItem("com.adobe.reactor.dataElements.Profile - Email", data.email);
        localStorage.setItem("project_registered_user", JSON.stringify(registrationData));
      }

      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);

      const submitButton = form.querySelector("button[type='submit']");
      const webhookUrl = submitButton?.dataset?.buttonWebhookUrl || config.buttonwebhookurl;
      if (webhookUrl) await submitToWebhook(form, webhookUrl, 'binji-registration');

      if (config.buttoneventtype) dispatchCustomEvent(config.buttoneventtype);

      const url = normalizeAemPath(config.redirecturl);
      if (url) {
        submitButton.textContent = "Welcome to Binji+";
        setTimeout(() => { window.location.href = url; }, 1500);
      }
    } catch (error) {
      console.error("Registration failed:", error);
    }
  });
}

export default async function decorate(block) {
  const config = readBlockConfig(block) || {};
  [...block.children].forEach((row) => { row.style.display = 'none'; });

  const codeBasePath = window.hlx?.codeBasePath || '';
  await loadCSS(`${codeBasePath}/blocks/form/form.css`); // Inherits base AEM form logic

  const formDef = buildBinjiRegistrationFormDef();
  const formContainer = document.createElement('div');
  formContainer.className = 'binji-registration__wrapper form';

  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.append(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  setTimeout(() => {
    attachRegistrationSubmitHandler(block, config);
    setupWizardStepIndicator(block);
  }, 100);
}