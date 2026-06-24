import { readBlockConfig } from "../../scripts/aem.js";
import { dispatchCustomEvent } from "../../scripts/custom-events.js";
import { syncFormDataLayer, DEFAULT_FORM_FIELD_MAP, attachLiveFormSync, submitToWebhook, fetchButtonDataSheet } from "../../scripts/form-data-layer.js";
import { normalizeAemPath } from "../../scripts/scripts.js";

function isTruthy(value) {
  return value === true || String(value).trim().toLowerCase() === "true";
}

function normalizeVariant(value) {
  return String(value || "default").trim().toLowerCase();
}

function withConditionalClasses(baseClassName, isVisible) {
  return isVisible ? baseClassName : `${baseClassName} is-hidden`;
}

function applyButtonConfigToSubmitButton(block, config) {
  const submitButton = block.querySelector("form button[type='submit']");
  if (!submitButton) return;
  const eventType = config.buttoneventtype;
  const normalizedEvent = eventType && String(eventType).trim();
  if (normalizedEvent) submitButton.dataset.buttonEventType = normalizedEvent;
  const webhookUrl = config.buttonwebhookurl;
  if (webhookUrl && String(webhookUrl).trim()) submitButton.dataset.buttonWebhookUrl = String(webhookUrl).trim();
  const formId = config.buttonformid;
  if (formId && String(formId).trim()) submitButton.dataset.buttonFormId = String(formId).trim();
  const buttonData = config.buttondata;
  if (buttonData && String(buttonData).trim()) submitButton.dataset.buttonData = String(buttonData).trim();
}

function clearProductObject() {
  if (typeof window.updateDataLayer === "function") {
    window.updateDataLayer({ product: {} }, false);
  }
}

// ============================================================
//  BINJI WIZARD FORM DEFINITION
// ============================================================
function buildBinjiWizardFormDef(config = {}) {
  const showCreditCard            = isTruthy(config.showcreditcard);
  const showLoyaltyProgram        = isTruthy(config.showloyaltyprogram);
  const showCommunicationPrefs    = config.showcommunicationpreferences !== undefined
    ? isTruthy(config.showcommunicationpreferences) : true;
  const showAddress               = config.showaddress !== undefined
    ? isTruthy(config.showaddress) : true;
  const showDateOfBirth           = config.showdateofbirth !== undefined
    ? isTruthy(config.showdateofbirth) : true;

  /* ---- STEP 1: EMAIL (unchanged from registration-wizard) ---- */
  const step1 = {
    id: 'step-1-email',
    name: 'step1',
    fieldType: 'panel',
    items: [
      { id: 'step-1-ind',   fieldType: 'heading', label: { value: 'STEP 1 OF 3' }, appliedCssClassNames: 'registration-wizard__step-indicator col-12' },
      { id: 'step-1-title', fieldType: 'heading', label: { value: 'Enter your email address' }, appliedCssClassNames: 'registration-wizard__title col-12' },
      { id: 'step-1-sub',   fieldType: 'heading', label: { value: 'You will use this email and password to log into your Binji+ account to watch your favourite shows and movies.' }, appliedCssClassNames: 'registration-wizard__subtitle col-12' },
      { id: 'email', name: 'email', fieldType: 'text-input', placeholder: 'Email', properties: { colspan: 12 }, appliedCssClassNames: 'registration-wizard__input col-12' },
      { id: 'step-1-terms', fieldType: 'heading', label: { value: 'Binji+ will use your data to personalize and improve your Binji+ experience and to send you information about Binji+. You can change your communication preferences at any time. By clicking "Next" you are agreeing to our Subscriber Agreement and acknowledging that you have read our Privacy Policy.' }, appliedCssClassNames: 'registration-wizard__disclaimer col-12' },
      // Marketing consent toggle — shown/hidden based on showCommunicationPrefs
      { id: 'marketingConsent', name: 'marketingConsent', fieldType: 'checkbox',
        label: { value: 'Yes, I would like to receive special offers and updates about Binji+ and other products by email.' },
        properties: { variant: 'switch', colspan: 12 },
        appliedCssClassNames: withConditionalClasses('registration-wizard__switch col-12', showCommunicationPrefs) },
    ],
  };

  /* ---- STEP 2: PASSWORD (unchanged from registration-wizard) ---- */
  const step2 = {
    id: 'step-2-password',
    name: 'step2',
    fieldType: 'panel',
    items: [
      { id: 'step-2-ind',   fieldType: 'heading', label: { value: 'STEP 2 OF 3' }, appliedCssClassNames: 'registration-wizard__step-indicator col-12' },
      { id: 'step-2-title', fieldType: 'heading', label: { value: 'Create a password' }, appliedCssClassNames: 'registration-wizard__title col-12' },
      { id: 'step-2-sub',   fieldType: 'heading', label: { value: 'You will use this email and password to log into your Binji+ account to watch your favourite shows and movies.' }, appliedCssClassNames: 'registration-wizard__subtitle col-12' },
      { id: 'password', name: 'password', fieldType: 'text-input', type: 'password', placeholder: '***', properties: { colspan: 12 }, appliedCssClassNames: 'registration-wizard__input col-12' },
      { id: 'step-2-rules', fieldType: 'heading', label: { value: 'Use a minimum of 6 characters with at least one number or special character.' }, appliedCssClassNames: 'registration-wizard__disclaimer col-12' },
    ],
  };

  /* ---- STEP 3: DETAILS + OPTIONAL PAYMENT ---- */
  const step3Items = [
    { id: 'step-3-title', fieldType: 'heading', label: { value: 'Complete your profile' }, appliedCssClassNames: 'registration-wizard__title col-12' },
    { id: 'step-3-sub',   fieldType: 'heading', label: { value: 'Just a few more details to get you started.' }, appliedCssClassNames: 'registration-wizard__subtitle col-12' },

    // First name / Last name always shown
    { id: 'firstName', name: 'firstName', fieldType: 'text-input', label: { value: 'First name' }, properties: { colspan: 6 }, appliedCssClassNames: 'registration-wizard__input col-6' },
    { id: 'lastName',  name: 'lastName',  fieldType: 'text-input', label: { value: 'Last name'  }, properties: { colspan: 6 }, appliedCssClassNames: 'registration-wizard__input col-6' },

    // Address (conditional)
    { id: 'address', name: 'streetAddress', fieldType: 'text-input', label: { value: 'Address' },   autoComplete: 'street-address', properties: { colspan: 12 }, appliedCssClassNames: withConditionalClasses('registration-wizard__input col-12', showAddress) },
    { id: 'zipCode', name: 'zipCode',       fieldType: 'text-input', label: { value: 'ZIP code' },  autoComplete: 'postal-code',     properties: { colspan: 6  }, appliedCssClassNames: withConditionalClasses('registration-wizard__input col-6', showAddress) },
    { id: 'city',    name: 'city',          fieldType: 'text-input', label: { value: 'City' },       autoComplete: 'address-level2',  properties: { colspan: 6  }, appliedCssClassNames: withConditionalClasses('registration-wizard__input col-6', showAddress) },

    // Date of birth (conditional)
    { id: 'dateOfBirth', name: 'dateOfBirth', fieldType: 'text-input', label: { value: 'Date of birth (YYYY-MM-DD)' }, placeholder: 'YYYY-MM-DD', properties: { colspan: 12 }, appliedCssClassNames: withConditionalClasses('registration-wizard__input col-12', showDateOfBirth) },

    // Loyalty program (conditional)
    { id: 'joinLoyaltyProgram', name: 'joinLoyaltyProgram', fieldType: 'checkbox',
      label: { value: 'I want to join loyalty program' },
      enum: ['true'], type: 'string',
      properties: { variant: 'switch', alignment: 'horizontal', colspan: 12 },
      appliedCssClassNames: withConditionalClasses('registration-wizard__switch col-12', showLoyaltyProgram) },
  ];

  // Credit card block — always shown when showcreditcard is true (not conditional)
  if (showCreditCard) {
    step3Items.push(
      { id: 'payment-heading', fieldType: 'heading', label: { value: 'Start streaming today' }, appliedCssClassNames: 'registration-wizard__title col-12' },
      { id: 'payment-sub',     fieldType: 'heading', label: { value: 'Endless stories for just $10.99/month. Cancel at any time, effective at the end of the payment period.' }, appliedCssClassNames: 'registration-wizard__subtitle col-12' },
      { id: 'cardName',   name: 'cardName',   fieldType: 'text-input', label: { value: 'NAME ON CARD'     }, properties: { colspan: 12 }, appliedCssClassNames: 'registration-wizard__input col-12' },
      { id: 'cardNumber', name: 'cardNumber', fieldType: 'text-input', label: { value: 'CARD NUMBER'      }, properties: { colspan: 12 }, appliedCssClassNames: 'registration-wizard__input col-12' },
      { id: 'cardExpiry', name: 'cardExpiry', fieldType: 'text-input', label: { value: 'EXPIRATION DATE'  }, placeholder: 'MM/YY', properties: { colspan: 6 }, appliedCssClassNames: 'registration-wizard__input col-6' },
      { id: 'cardCvv',    name: 'cardCvv',    fieldType: 'text-input', label: { value: 'SECURITY CODE'    }, placeholder: 'CVV',   properties: { colspan: 6 }, appliedCssClassNames: 'registration-wizard__input col-6' },
      // Trial consent toggle — always shown when credit card is shown (not conditional)
      { id: 'trialConsent', name: 'trialConsent', fieldType: 'checkbox',
        label: { value: "I want to start with a free 30 days trial. I won't be charged for my first month of use." },
        properties: { variant: 'switch', colspan: 12 },
        appliedCssClassNames: 'registration-wizard__switch col-12' },
      { id: 'step-3-terms', fieldType: 'heading',
        label: { value: 'Binji+ will use your data to personalize and improve your Binji+ experience and to send you information about Binji+. You can change your communication preferences at any time. By clicking "Submit" you are agreeing to our Subscriber Agreement and acknowledging that you have read our Privacy Policy.' },
        appliedCssClassNames: 'registration-wizard__disclaimer col-12' },
    );
  }

  // Submit button always last in step 3
  step3Items.push({
    id: 'submit-application-btn', name: 'submitApplication',
    fieldType: 'button', buttonType: 'submit',
    label: { value: 'Submit' },
    appliedCssClassNames: 'registration-wizard__submit-btn col-12',
  });

  const step3 = { id: 'step-3-details', name: 'step3', fieldType: 'panel', items: step3Items };

  return {
    id: 'create-account',
    fieldType: 'form',
    appliedCssClassNames: 'create-account-form is-wizard is-binji-wizard',
    items: [
      {
        id: 'panel-wizard', name: 'wizard', fieldType: 'panel',
        ':type': 'fd/panel/wizard',
        items: [step1, step2, step3],
      },
    ],
  };
}

// ============================================================
//  STANDARD CREATE-ACCOUNT FORM DEFINITION  (unchanged logic)
// ============================================================
function buildCreateAccountFormDef(config = {}) {
  const variant = normalizeVariant(config.variant);

  // Route binji variant + wizard layout to the dedicated builder
  if (variant === 'binji' && normalizeVariant(config['form-layout']) === 'wizard') {
    return buildBinjiWizardFormDef(config);
  }

  const isLumaVariant    = variant === 'luma';
  const isFrescopaVariant = variant === 'frescopa' || document.body.classList.contains('frescopa-theme');
  const isWkndFlyVariant  = variant === 'wknd-fly';

  const isWizard                   = normalizeVariant(config['form-layout']) === 'wizard';
  const showCreditCard             = isTruthy(config.showcreditcard);
  const showLoyaltyProgram         = isTruthy(config.showloyaltyprogram);
  const showCommunicationPreferences = config.showcommunicationpreferences !== undefined
    ? isTruthy(config.showcommunicationpreferences) : true;
  const showAddress                = config.showaddress !== undefined
    ? isTruthy(config.showaddress) : true;
  const showDateOfBirth            = config.showdateofbirth !== undefined
    ? isTruthy(config.showdateofbirth) : true;

  const shoeSizes      = ['', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'];
  const shirtSizes     = ['', 's', 'm', 'l', 'xl', 'xxl'];
  const favoriteColors = ['', 'black', 'blue', 'green', 'orange', 'pink', 'purple', 'red', 'white', 'yellow'];

  // Shared Core Fields
  const coreFieldsPart1 = [
    { id: 'firstName', name: 'firstName', fieldType: 'text-input', label: { value: 'First name'      }, properties: { colspan: 6  }, appliedCssClassNames: 'col-6' },
    { id: 'lastName',  name: 'lastName',  fieldType: 'text-input', label: { value: 'Last name'       }, properties: { colspan: 6  }, appliedCssClassNames: 'col-6' },
    { id: 'email',     name: 'email',     fieldType: 'text-input', label: { value: 'Email address'   }, autoComplete: 'email', properties: { colspan: isFrescopaVariant ? 6 : 12 }, appliedCssClassNames: isFrescopaVariant ? 'col-6' : 'col-12' },
    { id: 'phone',     name: 'phone',     fieldType: 'text-input', label: { value: 'Phone number'    }, autoComplete: 'tel',   properties: { colspan: isFrescopaVariant ? 6 : 12 }, appliedCssClassNames: isFrescopaVariant ? 'col-6' : 'col-12' },
    ...(isWkndFlyVariant ? [{ id: 'wkndFlyMember', name: 'wkndFlyMember', fieldType: 'drop-down', label: { value: 'WKND Fly Member' }, enum: ['', 'member', 'non-member'], enumNames: ['Select...', 'Member', 'Non-member'], type: 'string', properties: { colspan: 12 }, appliedCssClassNames: 'col-12' }] : []),
  ];

  const coreFieldsPart2 = [
    { id: 'address',     name: 'streetAddress', fieldType: 'text-input', label: { value: 'Address'                   }, autoComplete: 'street-address', properties: { colspan: 12 }, appliedCssClassNames: withConditionalClasses('col-12', showAddress) },
    { id: 'zipCode',     name: 'zipCode',       fieldType: 'text-input', label: { value: 'ZIP code'                  }, autoComplete: 'postal-code',     properties: { colspan: 6  }, appliedCssClassNames: withConditionalClasses('col-6',  showAddress) },
    { id: 'city',        name: 'city',          fieldType: 'text-input', label: { value: 'City'                      }, autoComplete: 'address-level2',  properties: { colspan: 6  }, appliedCssClassNames: withConditionalClasses('col-6',  showAddress) },
    { id: 'dateOfBirth', name: 'dateOfBirth',   fieldType: 'text-input', label: { value: 'Date of birth (YYYY-MM-DD)'}, placeholder: 'YYYY-MM-DD',       properties: { colspan: 12 }, appliedCssClassNames: withConditionalClasses('col-12', showDateOfBirth) },
    { id: 'joinLoyaltyProgram', name: 'joinLoyaltyProgram', fieldType: 'checkbox', label: { value: 'I want to join loyalty program' }, enum: ['true'], type: 'string', appliedCssClassNames: withConditionalClasses('col-12 switch loyalty-program-field', showLoyaltyProgram), properties: { variant: 'switch', alignment: 'horizontal', colspan: 12 } },
  ];

  const brandFields = [
    { id: 'heading-know-you-better', fieldType: 'heading', label: { value: 'LET US KNOW YOU BETTER' }, appliedCssClassNames: withConditionalClasses('col-12 know-you-better-heading', isLumaVariant) },
    { id: 'shoeSize',     name: 'shoeSize',     fieldType: 'drop-down', label: { value: 'Shoe size'      }, enum: shoeSizes,      enumNames: ['Select...', ...shoeSizes.slice(1)],                                appliedCssClassNames: withConditionalClasses('col-6 luma-preference-field',  isLumaVariant), properties: { colspan: 6  } },
    { id: 'shirtSize',    name: 'shirtSize',    fieldType: 'drop-down', label: { value: 'Shirt size'     }, enum: shirtSizes,     enumNames: ['Select...', 'S', 'M', 'L', 'XL', 'XXL'],                         appliedCssClassNames: withConditionalClasses('col-6 luma-preference-field',  isLumaVariant), properties: { colspan: 6  } },
    { id: 'favoriteColor',name: 'favoriteColor',fieldType: 'drop-down', label: { value: 'Favorite color' }, enum: favoriteColors, enumNames: ['Select...', 'Black', 'Blue', 'Green', 'Orange', 'Pink', 'Purple', 'Red', 'White', 'Yellow'], appliedCssClassNames: withConditionalClasses('col-12 luma-preference-field', isLumaVariant), properties: { colspan: 12 } },
    ...(isFrescopaVariant ? [{ id: 'frescopaOwner', name: 'frescopaOwner', fieldType: 'drop-down', label: { value: 'Do you already have a Frescopa machine?' }, placeholder: 'Do you already have a Frescopa machine?', enum: ['yes', 'no'], enumNames: ['Yes', 'No'], type: 'string', properties: { colspan: 12 }, appliedCssClassNames: 'col-12 frescopa-machine-field' }] : []),
  ];

  const creditCardFields = [
    { id: 'cc-section-title', fieldType: 'heading',    label: { value: 'Payment Information'  }, appliedCssClassNames: 'col-12 form-step-title' },
    { id: 'cardName',   name: 'cardName',   fieldType: 'text-input', label: { value: 'NAME ON CARD'    }, properties: { colspan: 12 }, appliedCssClassNames: 'col-12' },
    { id: 'cardNumber', name: 'cardNumber', fieldType: 'text-input', label: { value: 'CARD NUMBER'     }, properties: { colspan: 12 }, appliedCssClassNames: 'col-12' },
    { id: 'cardExpiry', name: 'cardExpiry', fieldType: 'text-input', label: { value: 'EXPIRATION DATE' }, placeholder: 'MM/YY',  properties: { colspan: 6 }, appliedCssClassNames: 'col-6' },
    { id: 'cardCvv',    name: 'cardCvv',    fieldType: 'text-input', label: { value: 'SECURITY CODE'   }, placeholder: 'CVV',    properties: { colspan: 6 }, appliedCssClassNames: 'col-6' },
    { id: 'trialConsent', name: 'trialConsent', fieldType: 'checkbox', label: { value: "I want to start with a free 30 days trial. I won't be charged for my first month of use." }, properties: { variant: 'switch', colspan: 12 }, appliedCssClassNames: 'col-12 switch' },
  ];

  const submitButton = { id: 'submit-btn', name: 'submitButton', fieldType: 'button', buttonType: 'submit', label: { value: 'Submit' }, appliedCssClassNames: 'submit-wrapper col-12' };

  // ---- WIZARD layout (non-binji) ----
  if (isWizard) {
    const wizardSteps = [];

    wizardSteps.push({
      id: 'step-1', name: 'step1', fieldType: 'panel',
      items: [
        { id: 'step-1-ind',   fieldType: 'heading', label: { value: 'STEP 1' }, appliedCssClassNames: 'wizard-step-indicator col-12' },
        { id: 'step-1-title', fieldType: 'heading', label: { value: 'Enter your details' }, appliedCssClassNames: 'wizard-step-title col-12' },
        ...coreFieldsPart1,
        ...coreFieldsPart2,
        { id: 'marketingConsent', name: 'marketingConsent', fieldType: 'checkbox', label: { value: 'Yes, I would like to receive special offers and updates by email.' }, properties: { variant: 'switch', colspan: 12 }, appliedCssClassNames: withConditionalClasses('col-12 switch', showCommunicationPreferences) },
      ],
    });

    const step2Items = [
      { id: 'step-2-ind',   fieldType: 'heading', label: { value: 'STEP 2' }, appliedCssClassNames: 'wizard-step-indicator col-12' },
      { id: 'step-2-title', fieldType: 'heading', label: { value: 'Set your preferences' }, appliedCssClassNames: 'wizard-step-title col-12' },
      { id: 'password', name: 'password', fieldType: 'text-input', type: 'password', label: { value: 'Password' }, placeholder: '***', properties: { colspan: 12 }, appliedCssClassNames: 'col-12' },
      ...brandFields,
    ];
    if (!showCreditCard) step2Items.push(submitButton);
    wizardSteps.push({ id: 'step-2', name: 'step2', fieldType: 'panel', items: step2Items });

    if (showCreditCard) {
      wizardSteps.push({
        id: 'step-3', name: 'step3', fieldType: 'panel',
        items: [
          { id: 'step-3-ind', fieldType: 'heading', label: { value: 'STEP 3' }, appliedCssClassNames: 'wizard-step-indicator col-12' },
          ...creditCardFields,
          submitButton,
        ],
      });
    }

    return {
      id: 'create-account', fieldType: 'form', appliedCssClassNames: 'create-account-form is-wizard',
      items: [{ id: 'panel-wizard', name: 'wizard', fieldType: 'panel', ':type': 'fd/panel/wizard', items: wizardSteps }],
    };

  } else {
    // ---- FLAT / SINGLE layout ----
    return {
      id: 'create-account', fieldType: 'form', appliedCssClassNames: 'create-account-form',
      items: [
        { id: 'heading-create-account', fieldType: 'heading', label: { value: 'Create an account' }, appliedCssClassNames: 'col-12' },
        {
          id: 'panel-main', name: 'main', fieldType: 'panel',
          items: [
            ...coreFieldsPart1,
            ...coreFieldsPart2,
            { id: 'communicationHeading', fieldType: 'heading', label: { value: 'Communication preferences' }, appliedCssClassNames: withConditionalClasses('col-12 communication-heading', showCommunicationPreferences) },
            { id: 'prefEmail',    name: 'prefEmail',    fieldType: 'checkbox', label: { value: 'Email'    }, enum: ['true'], type: 'string', properties: { variant: 'switch', alignment: 'horizontal', colspan: 4 }, appliedCssClassNames: withConditionalClasses('col-4 switch', showCommunicationPreferences) },
            { id: 'prefPhone',    name: 'prefPhone',    fieldType: 'checkbox', label: { value: 'Phone'    }, enum: ['true'], type: 'string', properties: { variant: 'switch', alignment: 'horizontal', colspan: 4 }, appliedCssClassNames: withConditionalClasses('col-4 switch', showCommunicationPreferences) },
            { id: 'prefSms',      name: 'prefSms',      fieldType: 'checkbox', label: { value: 'SMS'      }, enum: ['true'], type: 'string', properties: { variant: 'switch', alignment: 'horizontal', colspan: 4 }, appliedCssClassNames: withConditionalClasses('col-4 switch', showCommunicationPreferences) },
            { id: 'prefWhatsapp', name: 'prefWhatsapp', fieldType: 'checkbox', label: { value: 'WhatsApp' }, enum: ['true'], type: 'string', properties: { variant: 'switch', alignment: 'horizontal', colspan: 4 }, appliedCssClassNames: withConditionalClasses('col-4 switch', showCommunicationPreferences) },
            ...brandFields,
            ...(showCreditCard ? creditCardFields : []),
            submitButton,
          ],
        },
      ],
    };
  }
}

// ============================================================
//  WIZARD STEP INDICATOR
//  Uses binji-specific class names when binji wizard is active
// ============================================================
function setupWizardStepIndicator(block, isBinjiWizard = false) {
  const wizard = block.querySelector('form .wizard');
  if (!wizard) return;

  const totalSteps = wizard.querySelectorAll('.panel-wrapper').length;
  const btnWrapper = wizard.querySelector('.wizard-button-wrapper');
  if (!btnWrapper || totalSteps === 0) return;

  const progressWrapper = document.createElement('div');
  const dotsContainer   = document.createElement('div');

  if (isBinjiWizard) {
    progressWrapper.className = 'registration-wizard__progress-wrapper';
    dotsContainer.className   = 'registration-wizard__dots';
    for (let i = 0; i < totalSteps; i++) {
      const dot = document.createElement('div');
      dot.className = 'registration-wizard__dot';
      dotsContainer.appendChild(dot);
    }
  } else {
    progressWrapper.className = 'wizard-progress-wrapper';
    dotsContainer.className   = 'wizard-dots';
    for (let i = 0; i < totalSteps; i++) {
      const dot = document.createElement('div');
      dot.className = 'wizard-dot';
      dotsContainer.appendChild(dot);
    }
  }

  progressWrapper.appendChild(dotsContainer);

  const dotSelector  = isBinjiWizard ? '.registration-wizard__dot' : '.wizard-dot';
  const updateDots = () => {
    const current = wizard.querySelector('.current-wizard-step');
    const idx     = current ? parseInt(current.dataset.index, 10) : 0;
    dotsContainer.querySelectorAll(dotSelector).forEach((dot, i) => {
      dot.classList.toggle('active', i <= idx);
    });
  };

  updateDots();
  wizard.addEventListener('wizard:navigate', updateDots);

  const nextBtn = btnWrapper.querySelector('.wizard-button-next, [id*="wizard-button-next"]');
  if (nextBtn) btnWrapper.insertBefore(progressWrapper, nextBtn);

  const submitWrapper = wizard.querySelector('.submit-wrapper');
  if (submitWrapper) btnWrapper.appendChild(submitWrapper);
}

// ============================================================
//  SUBMIT HANDLER  (binji variant)
// ============================================================
function attachBinjiSubmitHandler(block, config) {
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

      if (data.email) {
        localStorage.setItem('com.adobe.reactor.dataElements.Identities', JSON.stringify({ Email: [{ id: data.email, primary: true }] }));
        localStorage.setItem('com.adobe.reactor.dataElements.Profile - Email', data.email);
        localStorage.setItem('project_registered_user', JSON.stringify(registrationData));
      }

      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);

      const submitButton = form.querySelector("button[type='submit']");
      const webhookUrl   = submitButton?.dataset?.buttonWebhookUrl || config.buttonwebhookurl;
      if (webhookUrl) await submitToWebhook(form, webhookUrl, 'registration-wizard');

      if (config.buttoneventtype) dispatchCustomEvent(config.buttoneventtype);

      const url = normalizeAemPath(config.redirecturl || config.redirectUrl);
      if (url) {
        if (submitButton) submitButton.textContent = 'Welcome to Binji+';
        setTimeout(() => { window.location.href = url; }, 1500);
      }
    } catch (error) {
      console.error('Registration failed:', error);
    }
  });
}

// ============================================================
//  DECORATE
// ============================================================
export default async function decorate(block) {
  const config  = readBlockConfig(block) || {};
  const variant = normalizeVariant(config.variant);
  const isBinjiWizard = variant === 'binji' && normalizeVariant(config['form-layout']) === 'wizard';

  [...block.children].forEach((row) => { row.style.display = 'none'; });

  const formDef       = buildCreateAccountFormDef(config);
  const formContainer = document.createElement('div');
  formContainer.className = 'form';

  const pre  = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(formDef);
  pre.append(code);
  formContainer.append(pre);
  block.replaceChildren(formContainer);

  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  setTimeout(() => {
    applyButtonConfigToSubmitButton(block, config);

    if (isBinjiWizard) {
      attachBinjiSubmitHandler(block, config);
    } else {
      prePopulateFormFromDataLayer(block);
      attachCreateAccountSubmitHandler(block, config);
    }

    setupWizardStepIndicator(block, isBinjiWizard);

    const form = block.querySelector('form');
    if (form) {
      syncFormDataLayer(form, DEFAULT_FORM_FIELD_MAP);
      if (!isBinjiWizard) attachLiveFormSync(form, DEFAULT_FORM_FIELD_MAP);
    }

    // Pre-check communication prefs for non-binji flat form
    if (!isBinjiWizard) {
      ['prefEmail', 'prefPhone', 'prefSms', 'prefWhatsapp'].forEach((name) => {
        const input = block.querySelector(`input[name="${name}"]`);
        if (input) input.checked = true;
      });
    }
  }, 100);
}