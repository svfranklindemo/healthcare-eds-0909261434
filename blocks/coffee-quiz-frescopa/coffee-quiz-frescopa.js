import { readBlockConfig } from '../../scripts/aem.js';
import { normalizeAemPath } from '../../scripts/scripts.js';
import { dispatchCustomEvent } from '../../scripts/custom-events.js';
import { getHostname } from '../../scripts/utils.js';

// Quiz images are fixed and always live under this DAM folder.
const DAM_IMAGE_PATH = '/content/dam/frescopa/en/images/coffee-quiz-frescopa';

function buildDefaultSteps(base) {
  const p = (name) => `${base}${DAM_IMAGE_PATH}/${name}`;
  return [
    {
      question: 'Where would you choose to enjoy your favorite coffee?',
      columns: 2,
      dataLayerKey: 'favoriteLocation',
      options: [
        { image: p('quiz-option-1-1.jpg'), label: '', value: 'home', dataLayerValue: 'beach' },
        { image: p('quiz-option-1-2.jpg'), label: '', value: 'work', dataLayerValue: 'countryside' },
        { image: p('quiz-option-1-3.jpg'), label: '', value: 'on-the-go', dataLayerValue: 'villaAbroad' },
        { image: p('quiz-option-1-4.jpg'), label: '', value: 'outdoors', dataLayerValue: 'winterCabin' },
      ],
    },
    {
      question: 'How many cups of coffee do you make a day?',
      columns: 2,
      dataLayerKey: 'dailyConsumption',
      options: [
        { image: p('quiz-option-2-1.jpg'), label: '', value: '1-cup', dataLayerValue: '1cup' },
        { image: p('quiz-option-2-2.jpg'), label: '', value: '2-3-cups', dataLayerValue: '2cups' },
        { image: p('quiz-option-2-3.jpg'), label: '', value: '4-5-cups', dataLayerValue: '3to4cups' },
        { image: p('quiz-option-2-4.jpg'), label: '', value: '6-plus', dataLayerValue: 'moreThan5' },
      ],
    },
    {
      question: 'How do you like to make your coffee?',
      columns: 3,
      dataLayerKey: 'favoriteCoffeeMaker',
      options: [
        { image: p('quiz-option-3-1.jpg'), label: '', value: 'espresso', dataLayerValue: 'frenchPress' },
        { image: p('quiz-option-3-2.jpg'), label: '', value: 'drip', dataLayerValue: 'coffeePods' },
        { image: p('quiz-option-3-3.jpg'), label: '', value: 'french-press', dataLayerValue: 'espressoMachine' },
        { image: p('quiz-option-3-4.jpg'), label: '', value: 'pour-over', dataLayerValue: 'dripMachine' },
        { image: p('quiz-option-3-5.jpg'), label: '', value: 'capsule', dataLayerValue: 'pourOver' },
        { image: p('quiz-option-3-6.jpg'), label: '', value: 'cold-brew', dataLayerValue: 'mokaPot' },
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

export default async function decorate(block) {
  const cfg = readBlockConfig(block);
  const isAemHost = window.location.hostname.includes('author')
    || window.location.hostname.includes('adobeaemcloud');
  const placeholderHost = (await getHostname())?.replace(/\/$/, '') || '';
  const imageBaseUrl = isAemHost
    ? window.location.origin
    : placeholderHost.replace('author', 'publish');

  const rawCompletionUrl = (cfg['completion-url'] || '').toString().trim();
  const completionUrl = (rawCompletionUrl.startsWith('/content/') || /^https?:\/\//i.test(rawCompletionUrl))
    ? normalizeAemPath(rawCompletionUrl)
    : '';

  const rawSignInUrl = (cfg['sign-in-url'] || '').toString().trim();
  const signInUrl = (rawSignInUrl.startsWith('/content/') || /^https?:\/\//i.test(rawSignInUrl))
    ? normalizeAemPath(rawSignInUrl)
    : '';
  const completionDelay = parseInt(cfg['completion-delay'], 10) || 0;
  const showProgress = cfg['show-progress']?.toLowerCase() !== 'false';
  const startedEvent = cfg['started-event-type'] || '';
  const stepEvent = cfg['step-event-type'] || '';
  const endedEvent = cfg['ended-event-type'] || '';
  const abandonedEvent = cfg['abandoned-event-type'] || '';

  const steps = buildDefaultSteps(imageBaseUrl);

  let currentStepIndex = 0;
  const selections = new Array(steps.length).fill(null);
  const coffeeQuizData = {};
  let completed = false;

  block.textContent = '';

  dispatchCustomEvent(startedEvent);

  if (abandonedEvent) {
    window.addEventListener('visibilitychange', () => {
      if (document.hidden && !completed && currentStepIndex < steps.length - 1) {
        dispatchCustomEvent(abandonedEvent);
      }
    });
  }

  // Progress indicator
  const progressEl = document.createElement('div');
  progressEl.className = 'coffee-quiz-frescopa__progress';
  if (!showProgress) progressEl.hidden = true;

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

        if (step.dataLayerKey && option.dataLayerValue) {
          coffeeQuizData[step.dataLayerKey] = option.dataLayerValue;
          if (typeof window.updateDataLayer === 'function') {
            window.updateDataLayer({ coffeeQuiz: { ...coffeeQuizData } });
          }
        }
      });

      grid.append(card);
    });

    stepEl.append(grid);
    updateButtons(index);
    updateDots(index);

    if (typeof window.updateDataLayer === 'function') {
      window.updateDataLayer({ wizard: { currentStep: index } });
    }
  }

  nextBtn.addEventListener('click', () => {
    if (currentStepIndex < steps.length - 1) {
      currentStepIndex += 1;
      dispatchCustomEvent(stepEvent);
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
    const isLoggedIn = localStorage.getItem('project_user_logged_in') === 'true';

    completed = true;
    submitBtn.textContent = 'Submitting…';
    submitBtn.disabled = true;
    backBtn.disabled = true;

    dispatchCustomEvent(endedEvent);

    setTimeout(
      () => {
        const target = isLoggedIn ? completionUrl : signInUrl;
        if (target) window.location.assign(target);
      },
      isLoggedIn ? Math.max(1000, completionDelay || 0) : 1000
    );
  });

  renderStep(0);
}
