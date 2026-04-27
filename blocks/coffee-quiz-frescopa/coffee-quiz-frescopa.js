// AEM DAM base path for quiz images — relative path works on author, needs
// imageBaseUrl prefix (e.g. AEM publish host) to work on live EDS delivery.
const DAM_IMAGE_PATH = '/content/dam/frescopa/en/images/coffee-quiz-frescopa';

function buildDefaultSteps(base) {
  const p = (name) => `${base}${DAM_IMAGE_PATH}/${name}`;
  return [
    {
      question: 'Where would you choose to enjoy your favorite coffee?',
      columns: 2,
      options: [
        { image: p('quiz-option-1-1.jpg'), label: '', value: 'home' },
        { image: p('quiz-option-1-2.jpg'), label: '', value: 'work' },
        { image: p('quiz-option-1-3.jpg'), label: '', value: 'on-the-go' },
        { image: p('quiz-option-1-4.jpg'), label: '', value: 'outdoors' },
      ],
    },
    {
      question: 'How many cups of coffee do you make a day?',
      columns: 2,
      options: [
        { image: p('quiz-option-2-1.jpg'), label: '', value: '1-cup' },
        { image: p('quiz-option-2-2.jpg'), label: '', value: '2-3-cups' },
        { image: p('quiz-option-2-3.jpg'), label: '', value: '4-5-cups' },
        { image: p('quiz-option-2-4.jpg'), label: '', value: '6-plus' },
      ],
    },
    {
      question: 'How do you like to make your coffee?',
      columns: 3,
      options: [
        { image: p('quiz-option-3-1.jpg'), label: '', value: 'espresso' },
        { image: p('quiz-option-3-2.jpg'), label: '', value: 'drip' },
        { image: p('quiz-option-3-3.jpg'), label: '', value: 'french-press' },
        { image: p('quiz-option-3-4.jpg'), label: '', value: 'pour-over' },
        { image: p('quiz-option-3-5.jpg'), label: '', value: 'capsule' },
        { image: p('quiz-option-3-6.jpg'), label: '', value: 'cold-brew' },
      ],
    },
    {
      // Step 4: display-only horizontal row (Container in Oxygen2, not CardSelection)
      // Image order matches reference: 1, 3, 2, 4
      question: 'What flavor profile describes your perfect cup?',
      columns: 4,
      displayOnly: true,
      options: [
        { image: p('quiz-option-4-1.jpg'), label: '', value: 'bold' },
        { image: p('quiz-option-4-3.jpg'), label: '', value: 'sweet' },
        { image: p('quiz-option-4-2.jpg'), label: '', value: 'mild' },
        { image: p('quiz-option-4-4.jpg'), label: '', value: 'fruity' },
      ],
    },
  ];
}

// Prepend imageBaseUrl to any relative /content/dam/ path so the same
// authored path works on both author (no prefix needed) and live EDS delivery.
function resolveImageSrc(src, imageBaseUrl) {
  if (!src) return src;
  if (!imageBaseUrl) return src;
  // Already absolute — leave as-is
  if (/^https?:\/\//i.test(src)) return src;
  // Relative DAM path — prepend the publish host
  return `${imageBaseUrl.replace(/\/$/, '')}${src}`;
}

function parseConfig(block) {
  const config = {
    completionUrl: '',
    completionDelay: 0,
    showProgress: true,
    imageBaseUrl: '',
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
      const typeRaw = cells[3]?.textContent?.trim().toLowerCase();
      currentStep = {
        question: cells[1]?.textContent?.trim() || '',
        columns: parseInt(cells[2]?.textContent?.trim(), 10) || 2,
        displayOnly: typeRaw === 'display',
        options: [],
      };
      steps.push(currentStep);
      return;
    }

    if (currentStep) {
      // img element src is already browser-resolved; getAttribute gives the raw authored value
      const imgEl = cells[0].querySelector('img');
      const rawSrc = imgEl?.getAttribute('src') || cells[0].textContent.trim();
      if (imgEl || rawSrc.match(/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i)) {
        currentStep.options.push({
          // store raw src — resolveImageSrc() is applied at render time once imageBaseUrl is known
          image: rawSrc,
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
      case 'image-base-url':
        config.imageBaseUrl = cells[1]?.textContent?.trim() || '';
        break;
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

  const steps_ = steps.length ? steps : buildDefaultSteps(config.imageBaseUrl);
  // For authored steps, apply imageBaseUrl to any relative DAM paths now
  if (steps.length && config.imageBaseUrl) {
    steps_.forEach((step) => {
      step.options.forEach((opt) => {
        opt.image = resolveImageSrc(opt.image, config.imageBaseUrl);
      });
    });
  }

  return { config, steps: steps_ };
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
  nextBtn.className = 'coffee-quiz-frescopa__btn coffee-quiz-frescopa__btn--primary coffee-next';
  nextBtn.textContent = 'Next';
  nextBtn.type = 'button';

  const submitBtn = document.createElement('button');
  submitBtn.className = 'coffee-quiz-frescopa__btn coffee-quiz-frescopa__btn--primary coffee-submit';
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
    const step = steps[index];
    const isLast = index === steps.length - 1;
    const canProceed = step.displayOnly || selections[index] !== null;

    nextBtn.classList.toggle('hide', isLast);
    nextBtn.disabled = !canProceed;
    submitBtn.classList.toggle('show', isLast);
    submitBtn.disabled = !canProceed;
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
    const isLastStep = index === steps.length - 1;
    grid.className = `coffee-quiz-frescopa__cards coffee-quiz-frescopa__cards--cols-${cols}${isLastStep ? ' step-4' : ''}`;

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
