import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { readBlockConfig, loadCSS } from '../../scripts/aem.js';
import { normalizeAemPath, isAuthorEnvironment } from '../../scripts/scripts.js';
import { fetchButtonDataSheet } from '../../scripts/form-data-layer.js';
/**
 * Checkout block – consolidates selected flights from the flights block and shows Trip Summary.
 * Selected flights are stored in localStorage (project_selected_flights) when user clicks Select on any flight.
 * Book Now on the flights block redirects to the checkout page where this block is authored.
 * Confirm Purchase saves booking to sessionStorage and redirects to the confirmation page.
 */

const TRIP_STORAGE_KEY = 'project_selected_flights';
const BOOKING_STORAGE_KEY = 'project_booking_confirmation';

const LIVE_CONFIRMATION_PATH = '/en/confirmation';

function getConfirmationPath(authoredPath) {
  if (authoredPath) return normalizeAemPath(authoredPath);
  if (typeof window === 'undefined') return LIVE_CONFIRMATION_PATH;
  if (isAuthorEnvironment()) {
    const pathname = window.location.pathname;
    const enIndex = pathname.indexOf('/en/');
    if (enIndex !== -1) return pathname.slice(0, enIndex + 4) + 'confirmation.html';
    if (pathname.endsWith('/en')) return pathname + '/confirmation.html';
    return '/en/confirmation.html';
  }
  return LIVE_CONFIRMATION_PATH;
}

function getSelectedFlights() {
  try {
    const localRaw = localStorage.getItem(TRIP_STORAGE_KEY);
    if (localRaw) return JSON.parse(localRaw);
    return [];
  } catch {
    return [];
  }
}

function setSelectedFlights(list) {
  localStorage.setItem(TRIP_STORAGE_KEY, JSON.stringify(list));
}

function removeFlight(id) {
  const list = getSelectedFlights().filter((f) => f.id !== id);
  setSelectedFlights(list);
}

function getFlightsTotal(flights) {
  return flights.reduce((sum, f) => sum + (parseFloat(f.price) || 0), 0);
}

function syncCartDataLayerAfterFlightRemoval(removedFlightId) {
  if (typeof window.updateDataLayer !== 'function') return;

  const existingCart = typeof window.getDataLayerProperty === 'function'
    ? (window.getDataLayerProperty('cart') || {})
    : ((window.dataLayer && window.dataLayer.cart) || {});

  const existingProducts = (existingCart && existingCart.products && typeof existingCart.products === 'object')
    ? existingCart.products
    : {};
  const nextProducts = { ...existingProducts };
  delete nextProducts[removedFlightId];

  const productEntries = Object.values(nextProducts);
  const subTotal = productEntries.reduce((sum, product) => {
    const price = parseFloat(product?.price) || 0;
    const quantity = parseInt(product?.quantity, 10) || 1;
    return sum + (price * quantity);
  }, 0);
  const productCount = productEntries.length;

  const nextCart = {
    ...existingCart,
    products: nextProducts,
    productCount,
    subTotal,
    total: subTotal,
  };

  window.updateDataLayer({ cart: nextCart }, false);
}

function formatPrice(price) {
  const n = parseFloat(price);
  if (Number.isNaN(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function formatRoute(flight) {
  const from = flight.fromName || flight.from || '';
  const to = flight.toName || flight.to || '';
  const fromCode = flight.from ? ` (${flight.from})` : '';
  const toCode = flight.to ? ` (${flight.to})` : '';
  return `${from}${fromCode} to ${to}${toCode}`;
}

function generateBookingReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'B';
  for (let i = 0; i < 5; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function generateElectronicTicketNumber() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 11; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function generateItineraryNumber() {
  let s = '';
  for (let i = 0; i < 12; i += 1) s += Math.floor(Math.random() * 10);
  return s;
}

/** Generate 10 alphanumeric characters (e.g. "fa8e413cc7") for commerce.order.purchaseOrderNumber and order */
function generate10AlphaNumeric() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i += 1) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function collectCheckoutFormData(block) {
  const data = {};
  const inputs = block.querySelectorAll('input, select');
  inputs.forEach((el) => {
    const name = el.getAttribute('name');
    if (!name) return;
    if (el.type === 'checkbox') {
      data[name] = el.checked;
    } else {
      data[name] = el.value || '';
    }
  });
  return data;
}

function renderTripSummary(container, onRemove) {
  const flights = getSelectedFlights();
  container.innerHTML = '';
  if (flights.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'checkout-empty-trip';
    empty.textContent = 'No flights in your trip. Add flights from the Flights block, then use Book Now to come here.';
    container.appendChild(empty);
    return 0;
  }
  const table = document.createElement('div');
  table.className = 'checkout-trip-table';
  const header = document.createElement('div');
  header.className = 'checkout-trip-header';
  header.innerHTML = '<span>NAME</span><span>QTY</span><span>PRICE</span><span></span>';
  table.appendChild(header);
  flights.forEach((flight) => {
    const row = document.createElement('div');
    row.className = 'checkout-trip-row';
    const imgCell = document.createElement('div');
    imgCell.className = 'checkout-trip-image';
    if (flight.image) {
      const pic = document.createElement('picture');
      const img = document.createElement('img');
      img.src = flight.image;
      img.alt = formatRoute(flight);
      pic.appendChild(img);
      imgCell.appendChild(pic);
    }
    const routeCell = document.createElement('div');
    routeCell.className = 'checkout-trip-route';
    routeCell.textContent = formatRoute(flight);
    const nameCell = document.createElement('div');
    nameCell.className = 'checkout-trip-name';
    nameCell.appendChild(imgCell);
    nameCell.appendChild(routeCell);
    const qtyCell = document.createElement('div');
    qtyCell.className = 'checkout-trip-qty';
    qtyCell.textContent = '1';
    const priceCell = document.createElement('div');
    priceCell.className = 'checkout-trip-price';
    priceCell.textContent = formatPrice(flight.price);
    const removeCell = document.createElement('div');
    removeCell.className = 'checkout-trip-remove';
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'checkout-remove-btn';
    removeBtn.setAttribute('aria-label', 'Remove flight');
    removeBtn.textContent = '×';
    removeBtn.onclick = () => {
      removeFlight(flight.id);
      syncCartDataLayerAfterFlightRemoval(flight.id);
      onRemove();
    };
    removeCell.appendChild(removeBtn);
    row.appendChild(nameCell);
    row.appendChild(qtyCell);
    row.appendChild(priceCell);
    row.appendChild(removeCell);
    table.appendChild(row);
  });
  container.appendChild(table);
  return getFlightsTotal(flights);
}

/**
 * Adaptive form definition for the Upgrade, Preferences, Passenger Info and Payment sections.
 * Field `name` values are kept identical to the previous hand-rolled markup so all existing
 * datalayer/prefill/validation logic (which looks up fields by `name`) keeps working unchanged.
 * `appliedCssClassNames` re-uses the legacy `checkout-section`/`checkout-form`/`checkout-prefs`/
 * `checkout-checkbox` class names so existing block + theme CSS continues to apply.
 */
function buildCheckoutFieldsFormDef() {
  const passengerDescription = 'Please make sure your full name is entered exactly as it appears on your government-issued identification. This information is required based on international regulations.';
  const paymentDescription = 'Only credit/debit card payments are accepted. Ignore this section if you chose to pay with Frequent Flyer program points.';

  return {
    id: 'checkout-fields-form',
    fieldType: 'form',
    items: [
      {
        id: 'panel-upgrade',
        fieldType: 'panel',
        label: { value: '' },
        appliedCssClassNames: 'checkout-section',
        items: [
          { id: 'upgrade-heading', fieldType: 'heading', label: { value: 'Upgrade your trip' }, appliedCssClassNames: 'checkout-section-title', properties: { colspan: 12 } },
          { id: 'upgrade-points', name: 'upgrade-points', fieldType: 'checkbox', label: { value: 'Upgrade class with points' }, enum: ['on'], appliedCssClassNames: 'checkout-checkbox', properties: { colspan: 12 } },
          { id: 'upgrade-luggage', name: 'upgrade-luggage', fieldType: 'checkbox', label: { value: 'Add extra piece of checked-in luggage' }, enum: ['on'], appliedCssClassNames: 'checkout-checkbox', properties: { colspan: 12 } },
        ],
      },
      {
        id: 'panel-preferences',
        fieldType: 'panel',
        label: { value: '' },
        appliedCssClassNames: 'checkout-section checkout-prefs',
        items: [
          { id: 'preferences-heading', fieldType: 'heading', label: { value: 'Preferences' }, appliedCssClassNames: 'checkout-section-title', properties: { colspan: 12 } },
          { id: 'seat', name: 'seat', fieldType: 'drop-down', label: { value: 'Seat' }, enum: ['', 'window', 'aisle'], enumNames: ['Select...', 'Window', 'Aisle'], properties: { colspan: 4 } },
          { id: 'section', name: 'section', fieldType: 'drop-down', label: { value: 'Section' }, enum: ['', 'forward', 'rear'], enumNames: ['Select...', 'Forward', 'Rear'], properties: { colspan: 4 } },
          { id: 'meal', name: 'meal', fieldType: 'drop-down', label: { value: 'Meal' }, enum: ['', 'regular', 'vegetarian', 'low-calories', 'peanut-free', 'non-lactose', 'diabetic'], enumNames: ['Select...', 'Regular', 'Vegetarian', 'Low Calories', 'Peanut-Free', 'Non-Lactose', 'Diabetic'], properties: { colspan: 4 } },
        ],
      },
      {
        id: 'panel-passenger',
        fieldType: 'panel',
        label: { value: '' },
        appliedCssClassNames: 'checkout-section checkout-form',
        items: [
          { id: 'passenger-heading', fieldType: 'heading', label: { value: 'Passenger Information' }, appliedCssClassNames: 'checkout-section-title', properties: { colspan: 12 } },
          { id: 'passenger-description', fieldType: 'plain-text', value: passengerDescription, appliedCssClassNames: 'checkout-description', properties: { colspan: 12 } },
          { id: 'firstName', name: 'firstName', fieldType: 'text-input', label: { value: 'First Name' }, properties: { colspan: 12 } },
          { id: 'middleName', name: 'middleName', fieldType: 'text-input', label: { value: 'Middle Name (optional)' }, properties: { colspan: 12 } },
          { id: 'lastName', name: 'lastName', fieldType: 'text-input', label: { value: 'Last Name' }, properties: { colspan: 12 } },
          { id: 'birthDate', name: 'birthDate', fieldType: 'text-input', label: { value: 'Birth Date' }, placeholder: 'mm/dd/yyyy', properties: { colspan: 12 } },
          { id: 'gender', name: 'gender', fieldType: 'drop-down', label: { value: 'Gender' }, enum: ['', 'male', 'female'], enumNames: ['Not Specified', 'Male', 'Female'], properties: { colspan: 12 } },
          { id: 'frequentFlyerId', name: 'frequentFlyerId', fieldType: 'text-input', label: { value: 'Frequent Flyer ID' }, properties: { colspan: 12 } },
          { id: 'email', name: 'email', fieldType: 'text-input', label: { value: 'Email Address' }, properties: { colspan: 12 } },
          { id: 'phone', name: 'phone', fieldType: 'text-input', label: { value: 'Phone Number' }, properties: { colspan: 12 } },
          { id: 'wknd-club', name: 'wknd-club', fieldType: 'checkbox', label: { value: 'I want to sign up for WKND Fly Club' }, enum: ['on'], appliedCssClassNames: 'checkout-checkbox', properties: { colspan: 12 } },
          { id: 'sms', name: 'sms', fieldType: 'checkbox', label: { value: 'I want to get SMS with booking confirmation' }, enum: ['on'], appliedCssClassNames: 'checkout-checkbox', properties: { colspan: 12 } },
          { id: 'promo', name: 'promo', fieldType: 'checkbox', label: { value: 'I want to receive electronic mail with promotions and announcements' }, enum: ['on'], appliedCssClassNames: 'checkout-checkbox', properties: { colspan: 12 } },
        ],
      },
      {
        id: 'panel-payment',
        fieldType: 'panel',
        label: { value: '' },
        appliedCssClassNames: 'checkout-section checkout-form',
        items: [
          { id: 'payment-heading', fieldType: 'heading', label: { value: 'Payment Method' }, appliedCssClassNames: 'checkout-section-title', properties: { colspan: 12 } },
          { id: 'payment-description', fieldType: 'plain-text', value: paymentDescription, appliedCssClassNames: 'checkout-description', properties: { colspan: 12 } },
          { id: 'nameOnCard', name: 'nameOnCard', fieldType: 'text-input', label: { value: 'Name on Card' }, properties: { colspan: 12 } },
          { id: 'expiration', name: 'expiration', fieldType: 'text-input', label: { value: 'Expiration' }, placeholder: 'MM/YY', properties: { colspan: 12 } },
          { id: 'cardNumber', name: 'cardNumber', fieldType: 'text-input', label: { value: 'Card Number' }, placeholder: 'Digits only', maxLength: 19, pattern: '[0-9]*', properties: { colspan: 12 } },
          { id: 'cvv', name: 'cvv', fieldType: 'text-input', label: { value: 'CVV' }, placeholder: '3 or 4 digits', maxLength: 4, pattern: '[0-9]*', properties: { colspan: 12 } },
        ],
      },
    ],
  };
}

/** Read value from input/select (text or checked for checkbox) */
function getFieldValue(block, name) {
  const el = block.querySelector(`[name="${name}"]`);
  if (!el) return el === null ? '' : undefined;
  if (el.type === 'checkbox') return el.checked;
  return (el.value || '').trim();
}

/** Push all checkout form fields to datalayer (passenger, payment, upgrade, preferences) */
function updateDataLayerFromCheckoutForm(block) {
  if (typeof window.updateDataLayer !== 'function') return;
  const v = (name) => getFieldValue(block, name);

  const yesNo = (x) => (typeof window.getDataLayerYesNo === 'function' ? window.getDataLayerYesNo(x) : (x ? 'y' : 'n'));
  const updates = {
    emailConsent: v('promo') ?? false,
    extraLuggage: v('upgrade-luggage') ?? false,
    upgradeWithPoints: yesNo(v('upgrade-points')),
    travelPreferences: {
      seat: v('seat') || 'noPreference',
      seatSection: v('section') || 'noPreference',
      meal: v('meal') || 'regularMeal',
    },
    person: {
      name: {
        firstName: v('firstName') || '',
        middleName: v('middleName') || '',
        lastName: v('lastName') || '',
      },
      gender: v('gender') || 'not_specified',
      birthDate: v('birthDate') || '',
      isMember: yesNo(v('wknd-club')),
    },
    personalEmail: { address: v('email') || '' },
    mobilePhone: { number: v('phone') || '' },
    smsConsent: yesNo(v('sms')),
    loyaltyConsent: yesNo(v('wknd-club')),
    payment: {
      nameOnCard: v('nameOnCard') || '',
      cardExpiration: v('expiration') || '',
      cardNumber: v('cardNumber') || '',
      cvv: v('cvv') || '',
    },
    consents: {
      marketing: {
        email: { val: yesNo(v('promo')) },
      },
    },
  };

  updates._demosystem4 = {
    identification: {
      core: { loyaltyId: v('frequentFlyerId') || '' },
    },
  };

  window.updateDataLayer(updates, true);
}

/** Attach listeners so datalayer stays in sync with all checkout form fields */
function attachCheckoutDataLayerListeners(block) {
  updateDataLayerFromCheckoutForm(block);
  const inputs = block.querySelectorAll('input, select');
  inputs.forEach((el) => {
    const name = el.getAttribute('name');
    if (!name) return;
    const event = el.type === 'checkbox' ? 'change' : 'blur';
    el.addEventListener(event, () => updateDataLayerFromCheckoutForm(block));
  });
}

function renderTripTotal(sidebar, total, config) {
  sidebar.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'checkout-total-box';
  const flights = getSelectedFlights();
  const passengerCount = 1;
  const flightsTotal = total || 0;
  box.innerHTML = `
    <h3 class="checkout-total-title">Trip Total</h3>
    <div class="checkout-total-row"><span>${passengerCount} Passenger</span></div>
    <div class="checkout-total-row"><span>Flights</span><span>${formatPrice(flightsTotal)}</span></div>
    <div class="checkout-total-row"><span>Taxes</span><span>included</span></div>
    <hr class="checkout-total-divider">
    <div class="checkout-total-row checkout-total-final"><span>Total</span><span>${formatPrice(flightsTotal)}</span></div>
    <button type="button" class="checkout-confirm-btn" data-button-webhook-url="${config.buttonwebhookurl}" data-button-form-id="${config.buttonformid}" data-button-data="${config.buttondata}">Confirm Purchase</button>
  `;
  const confirmBtn = box.querySelector('.checkout-confirm-btn');
  if (confirmBtn) {
    const block = document.querySelector('.checkout-block');
    confirmBtn.onclick = async () => {
      if (flights.length === 0) {
        // eslint-disable-next-line no-alert
        alert('Please add at least one flight to your trip before confirming.');
        return;
      }
      const formData = block ? collectCheckoutFormData(block) : {};
      const bookingRef = generateBookingReference();
      const ticketNum = generateElectronicTicketNumber();
      const itineraryNum = generateItineraryNumber();
      const bookingData = {
        bookingReference: bookingRef,
        electronicTicketNumber: ticketNum,
        itineraryNumber: itineraryNum,
        total: flightsTotal,
        passengerCount: 1,
        flights: flights.map((f) => ({ ...f, route: formatRoute(f) })),
        formData,
      };
      try {
        sessionStorage.setItem(BOOKING_STORAGE_KEY, JSON.stringify(bookingData));
        // So Launch "Profile - Email from Storage" and Identity Map resolve when Confirm Purchase rule runs
        if (formData.email) {
          localStorage.setItem("com.adobe.reactor.dataElements.Profile - Email", formData.email);
          if (typeof window._satellite !== "undefined" && typeof window._satellite.setVar === "function") {
            window._satellite.setVar("Profile - Email", formData.email);
          }

          localStorage.setItem(
            "com.adobe.reactor.dataElements.Identities",
            JSON.stringify({
              Email: [
                {
                  id: formData.email,
                  primary: true,
                  authenticatedState: "authenticated",
                },
              ],
            })
          );

          sessionStorage.setItem(
            "com.adobe.reactor.dataElements.Identity Map",
            JSON.stringify({
              Email: [
                {
                  id: formData.email,
                  primary: true,
                  authenticatedState: "authenticated",
                },
              ],
            })
          );
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('Could not save booking to sessionStorage', e);
      }
      let orderId;
      if (typeof window.updateDataLayer === 'function') {
        orderId = generate10AlphaNumeric();
        const firstFlight = flights[0];
        updateDataLayerFromCheckoutForm(block);
        const bookingUpdates = {
          order: orderId,
          commerce: { order: { purchaseOrderNumber: orderId } },
          itineraryNumber: itineraryNum,
          bookingReference: bookingRef,
          ticketNumber: ticketNum,
          cart: { ...(typeof window.getDataLayerProperty === 'function' ? window.getDataLayerProperty('cart') : {}), total: flightsTotal },
          personalEmail: { address: formData.email || '' },
          _demosystem4: {
            identification: {
              core: {
                loyaltyId: formData.frequentFlyerId || (typeof window.getDataLayerProperty === 'function' ? (window.getDataLayerProperty('_demosystem4.identification.core')?.loyaltyId) : undefined) || '',
              },
            },
          },
        };
        if (firstFlight) {
          const dateVal = firstFlight.date;
          const todayISO = typeof window.getDataLayerDate === 'function' ? window.getDataLayerDate(new Date().toISOString().slice(0, 10)) : '';
          bookingUpdates.from = firstFlight.from || '';
          bookingUpdates.to = firstFlight.to || '';
          bookingUpdates.flightNumber = firstFlight.id || '';
          bookingUpdates.class = (typeof window.getDataLayerFlightClass === 'function' ? window.getDataLayerFlightClass(firstFlight.class) : (firstFlight.class || '')) || '';
          bookingUpdates.flightLength = (typeof window.getDataLayerFlightLength === 'function' ? window.getDataLayerFlightLength(firstFlight.flightLength) : (parseInt(firstFlight.flightLength, 10) || 0));
          bookingUpdates.date = (typeof window.getDataLayerDate === 'function' ? (window.getDataLayerDate(dateVal) || todayISO) : (dateVal || todayISO)) || '';
        }
        window.updateDataLayer(bookingUpdates, true);
        const buttonDataUrl = confirmBtn.dataset?.buttonData?.trim();
        if (buttonDataUrl) {
          const sheetData = await fetchButtonDataSheet(buttonDataUrl);
          if (sheetData) window.updateDataLayer(sheetData);
        }
        dispatchCustomEvent(config.buttoneventtype);
      }
      setTimeout(() => { window.location.href = getConfirmationPath(config.confirmationpath) + '?order=' + orderId; }, 2000);
    };
  }
  sidebar.appendChild(box);
}

/** Fill the form data from datalayer object available in local storage */
function fillFormDataFromDataLayer(block) {
  try {
    const rawData = localStorage.getItem('project_registered_user');
    if (!rawData) return;

    const userData = JSON.parse(rawData);
    const fields = [
      { name: 'firstName', value: userData?.firstName },
      { name: 'lastName', value: userData?.lastName },
      { name: 'email', value: userData?.email },
      { name: 'phone', value: userData?.phone },
    ];

    fields.forEach(({ name, value }) => {
      const el = block.querySelector(`[name="${name}"]`);
      if (!el) return;
      if (el.type === 'checkbox') {
        el.checked = !!value;
      } else {
        el.value = value || '';
      }
    });
  } catch (e) {
    console.warn('Could not fill form data from datalayer', e);
  }
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  /* Hide all config rows on live */
  [...block.children].forEach((row) => row.style.display = 'none');
  block.classList.add('checkout-block');
  const wrapper = document.createElement('div');
  wrapper.className = 'checkout-wrapper';
  const mainCol = document.createElement('div');
  mainCol.className = 'checkout-main';
  const sidebar = document.createElement('div');
  sidebar.className = 'checkout-sidebar';

  const header = document.createElement('div');
  header.className = 'checkout-header';
  header.innerHTML = '<h1 class="checkout-title">Trip Summary</h1>';
  mainCol.appendChild(header);

  const tripSection = document.createElement('div');
  tripSection.className = 'checkout-section checkout-trip-section';
  const tripTitle = document.createElement('h3');
  tripTitle.className = 'checkout-section-title';
  tripTitle.textContent = 'Trip Summary';
  tripSection.appendChild(tripTitle);
  const tripContainer = document.createElement('div');
  tripContainer.className = 'checkout-trip-container';
  tripSection.appendChild(tripContainer);
  mainCol.appendChild(tripSection);

  const refreshTripAndTotal = () => {
    const total = renderTripSummary(tripContainer, refreshTripAndTotal);
    renderTripTotal(sidebar, total, config);
  };

  refreshTripAndTotal();

  const formContainer = document.createElement('div');
  formContainer.className = 'checkout-fields-wrapper form';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = JSON.stringify(buildCheckoutFieldsFormDef());
  pre.append(code);
  formContainer.append(pre);
  mainCol.appendChild(formContainer);

  wrapper.appendChild(mainCol);
  wrapper.appendChild(sidebar);
  block.appendChild(wrapper);

  await loadCSS(`${window.hlx?.codeBasePath || ''}/blocks/form/form.css`);
  const formModule = await import('../form/form.js');
  await formModule.default(formContainer);

  /* Preserve original default-checked state for the loyalty opt-in checkbox */
  const wkndClub = block.querySelector('[name="wknd-club"]');
  if (wkndClub) wkndClub.checked = true;

  /* Rule engine can reset select value after render, so force the first option as default */
  ['seat', 'section', 'meal', 'gender'].forEach((name) => {
    const select = block.querySelector(`select[name="${name}"]`);
    if (select && select.options.length > 0) select.selectedIndex = 0;
  });

  restrictNumericFieldsToDigits(block);
  formatBirthDateInput(block);
  fillFormDataFromDataLayer(block);
  attachCheckoutDataLayerListeners(block);
}

/** Restrict phone, card number, CVV to digits only (strip non-numeric on input) */
function restrictNumericFieldsToDigits(block) {
  const numericNames = ['cardNumber', 'cvv'];
  numericNames.forEach((name) => {
    const el = block.querySelector(`[name="${name}"]`);
    if (!el || el.type === 'hidden') return;
    el.addEventListener('input', () => {
      const digits = el.value.replace(/\D/g, '');
      if (el.value !== digits) el.value = digits;
    });
  });
}

/** Birth date: accept digits only and auto-format to mm/dd/yyyy (works with or without slashes) */
function formatBirthDateInput(block) {
  const el = block.querySelector('[name="birthDate"]');
  if (!el) return;
  el.addEventListener('input', () => {
    const digits = el.value.replace(/\D/g, '').slice(0, 8);
    let formatted = '';
    if (digits.length > 0) formatted = digits.slice(0, 2);
    if (digits.length > 2) formatted += `/${digits.slice(2, 4)}`;
    if (digits.length > 4) formatted += `/${digits.slice(4, 8)}`;
    if (el.value !== formatted) el.value = formatted;
  });
}
