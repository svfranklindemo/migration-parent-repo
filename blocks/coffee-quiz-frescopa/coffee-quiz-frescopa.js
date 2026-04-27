// Default quiz steps matching the Frescopa MyBarista Coffee Quiz
const IMAGE_BASE_PATH = '/content/dam/frescopa/en/images/coffee-quiz-frescopa';

const DEFAULT_STEPS = [
  {
    question: 'Where would you choose to enjoy your favorite coffee?',
    columns: 2,
    options: [
      { image: `${IMAGE_BASE_PATH}/quiz-option-1-1.jpg`, label: '', value: 'home' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-1-2.jpg`, label: '', value: 'work' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-1-3.jpg`, label: '', value: 'on-the-go' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-1-4.jpg`, label: '', value: 'outdoors' },
    ],
  },
  {
    question: 'How many cups of coffee do you make a day?',
    columns: 2,
    options: [
      { image: `${IMAGE_BASE_PATH}/quiz-option-2-1.jpg`, label: '', value: '1-cup' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-2-2.jpg`, label: '', value: '2-3-cups' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-2-3.jpg`, label: '', value: '4-5-cups' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-2-4.jpg`, label: '', value: '6-plus' },
    ],
  },
  {
    question: 'How do you like to make your coffee?',
    columns: 3,
    options: [
      { image: `${IMAGE_BASE_PATH}/quiz-option-3-1.jpg`, label: '', value: 'espresso' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-3-2.jpg`, label: '', value: 'drip' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-3-3.jpg`, label: '', value: 'french-press' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-3-4.jpg`, label: '', value: 'pour-over' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-3-5.jpg`, label: '', value: 'capsule' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-3-6.jpg`, label: '', value: 'cold-brew' },
    ],
  },
  {
    question: 'What flavor profile describes your perfect cup?',
    columns: 2,
    options: [
      { image: `${IMAGE_BASE_PATH}/quiz-option-4-1.jpg`, label: '', value: 'bold' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-4-2.jpg`, label: '', value: 'mild' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-4-3.jpg`, label: '', value: 'sweet' },
      { image: `${IMAGE_BASE_PATH}/quiz-option-4-4.jpg`, label: '', value: 'fruity' },
    ],
  },
];

function parseConfig(block) {
  const config = {
    completionUrl: '',
    completionDelay: 0,
    showProgress: true,
    startedEvent: 'quiz-started',
    stepEvent: 'quiz-step',
    endedEvent: 'quiz-ended',
    abandonedEvent: 'quiz-abandoned',
  };
  const steps = [];
  let currentStep = null;

  [...block.children].forEach((row) => {
    const cells = [...row.children];
    if (!cells.length) return;

    const key = cells[0].textContent.trim().toLowerCase();

    if (key === 'step') {
      currentStep = {
        question: cells[1]?.textContent?.trim() || '',
        columns: parseInt(cells[2]?.textContent?.trim(), 10) || 2,
        options: [],
      };
      steps.push(currentStep);
      return;
    }

    if (currentStep) {
      const imgEl = cells[0].querySelector('img');
      const src = imgEl?.src || cells[0].textContent.trim();
      if (imgEl || src.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i)) {
        currentStep.options.push({
          image: src,
          label: cells[1]?.textContent?.trim() || '',
          value:
            cells[2]?.textContent?.trim() ||
            cells[1]?.textContent?.trim().toLowerCase().replace(/\s+/g, '-') ||
            String(currentStep.options.length + 1),
        });
        return;
      }
    }

    switch (key) {
      case 'completion-url':
        config.completionUrl = cells[1]?.textContent?.trim() || '';
        break;
      case 'completion-delay':
        config.completionDelay = parseInt(cells[1]?.textContent?.trim(), 10) || 0;
        break;
      case 'show-progress':
        config.showProgress = cells[1]?.textContent?.trim().toLowerCase() !== 'false';
        break;
      case 'started-event-type':
        config.startedEvent = cells[1]?.textContent?.trim() || config.startedEvent;
        break;
      case 'step-event-type':
        config.stepEvent = cells[1]?.textContent?.trim() || config.stepEvent;
        break;
      case 'ended-event-type':
        config.endedEvent = cells[1]?.textContent?.trim() || config.endedEvent;
        break;
      case 'abandoned-event-type':
        config.abandonedEvent = cells[1]?.textContent?.trim() || config.abandonedEvent;
        break;
      default:
        break;
    }
  });

  return { config, steps: steps.length ? steps : DEFAULT_STEPS };
}

function fireEvent(type) {
  if (!type) return;
  document.dispatchEvent(new CustomEvent(type, { bubbles: true }));
}

export default function decorate(block) {
  const { config, steps } = parseConfig(block);

  let currentStepIndex = 0;
  const selections = new Array(steps.length).fill(null);
  let completed = false;

  block.textContent = '';

  fireEvent(config.startedEvent);

  window.addEventListener('visibilitychange', () => {
    if (document.hidden && !completed && currentStepIndex < steps.length - 1) {
      fireEvent(config.abandonedEvent);
    }
  });

  // Progress indicator
  const progressEl = document.createElement('div');
  progressEl.className = 'coffee-quiz-frescopa__progress';
  if (!config.showProgress) progressEl.hidden = true;

  const dotsEl = document.createElement('div');
  dotsEl.className = 'coffee-quiz-frescopa__dots';
  steps.forEach(() => {
    const dot = document.createElement('span');
    dot.className = 'coffee-quiz-frescopa__dot';
    dotsEl.append(dot);
  });

  const progressLabel = document.createElement('span');
  progressLabel.className = 'coffee-quiz-frescopa__progress-label';
  progressEl.append(dotsEl, progressLabel);

  // Step content area
  const stepEl = document.createElement('div');
  stepEl.className = 'coffee-quiz-frescopa__step';

  // Navigation buttons row: Next/Submit on left (row-reverse), Back on right
  const buttonsEl = document.createElement('div');
  buttonsEl.className = 'coffee-quiz-frescopa__buttons';

  const nextBtn = document.createElement('button');
  nextBtn.className = 'coffee-quiz-frescopa__btn coffee-quiz-frescopa__btn--primary';
  nextBtn.textContent = 'Next';
  nextBtn.type = 'button';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'coffee-quiz-frescopa__btn coffee-quiz-frescopa__btn--primary';
  submitBtn.textContent = 'Submit';
  submitBtn.type = 'button';

  const backBtn = document.createElement('button');
  backBtn.className = 'coffee-quiz-frescopa__btn coffee-quiz-frescopa__btn--secondary';
  backBtn.textContent = 'Back';
  backBtn.type = 'button';

  buttonsEl.append(nextBtn, submitBtn, progressEl, backBtn);
  block.append(stepEl, buttonsEl);

  function updateDots(index) {
    [...dotsEl.children].forEach((dot, i) =>
      dot.classList.toggle('is-active', i <= index)
    );
    progressLabel.textContent = `${index + 1}/${steps.length}`;
  }

  function updateButtons(index) {
    const hasSelection = selections[index] !== null;
    const isLast = index === steps.length - 1;

    nextBtn.hidden = isLast;
    nextBtn.disabled = !hasSelection;
    submitBtn.hidden = !isLast;
    submitBtn.disabled = !hasSelection;
    backBtn.disabled = index === 0;
  }

  function renderStep(index) {
    const step = steps[index];
    stepEl.innerHTML = '';

    const questionEl = document.createElement('div');
    questionEl.className = 'coffee-quiz-frescopa__question';
    const heading = document.createElement('h2');
    heading.textContent = step.question;
    questionEl.append(heading);
    stepEl.append(questionEl);

    const cols = step.columns || (step.options.length > 4 ? 3 : 2);
    const grid = document.createElement('div');
    grid.className = `coffee-quiz-frescopa__cards coffee-quiz-frescopa__cards--cols-${cols}`;

    step.options.forEach((option, optIndex) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'coffee-quiz-frescopa__card';
      card.dataset.value = option.value;
      if (selections[index] === optIndex) card.classList.add('is-selected');

      if (option.image) {
        const img = document.createElement('img');
        img.src = option.image;
        img.alt = option.label || `Option ${optIndex + 1}`;
        img.loading = 'lazy';
        card.append(img);
      }

      if (option.label) {
        const labelEl = document.createElement('span');
        labelEl.className = 'coffee-quiz-frescopa__card-label';
        labelEl.textContent = option.label;
        card.append(labelEl);
      }

      card.addEventListener('click', () => {
        selections[index] = optIndex;
        [...grid.children].forEach((c, i) =>
          c.classList.toggle('is-selected', i === optIndex)
        );
        updateButtons(index);
      });

      grid.append(card);
    });

    stepEl.append(grid);
    updateButtons(index);
    updateDots(index);
  }

  nextBtn.addEventListener('click', () => {
    if (currentStepIndex < steps.length - 1) {
      currentStepIndex += 1;
      fireEvent(config.stepEvent);
      renderStep(currentStepIndex);
    }
  });

  backBtn.addEventListener('click', () => {
    if (currentStepIndex > 0) {
      currentStepIndex -= 1;
      renderStep(currentStepIndex);
    }
  });

  submitBtn.addEventListener('click', () => {
    completed = true;
    fireEvent(config.endedEvent);

    submitBtn.textContent = 'Submitting…';
    submitBtn.disabled = true;
    backBtn.disabled = true;

    if (config.completionUrl) {
      setTimeout(
        () => window.location.assign(config.completionUrl),
        config.completionDelay || 0
      );
    }
  });

  renderStep(0);
}
