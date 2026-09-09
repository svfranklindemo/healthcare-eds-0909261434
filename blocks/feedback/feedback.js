function clampRating(value) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) return 4;
  return Math.max(0, Math.min(5, n));
}

function createStars(rating) {
  const stars = document.createElement('div');
  stars.className = 'feedback-stars';
  stars.setAttribute('role', 'radiogroup');
  stars.setAttribute('aria-label', 'Feedback rating');

  const setRating = (value) => {
    stars.dataset.rating = String(value);
    stars.setAttribute('aria-label', `Feedback rating: ${value} out of 5`);
    [...stars.children].forEach((star, index) => {
      const active = index < value;
      star.classList.toggle('is-active', active);
      star.setAttribute('aria-checked', active && index === value - 1 ? 'true' : 'false');
    });
  };

  for (let i = 1; i <= 5; i += 1) {
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'feedback-star';
    star.setAttribute('role', 'radio');
    star.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
    star.innerHTML = '<span aria-hidden="true">&#9733;</span>';
    star.addEventListener('click', () => setRating(i));
    stars.append(star);
  }

  setRating(rating);
  return stars;
}

function createFeedbackRow(question, rating) {
  const row = document.createElement('div');
  row.className = 'feedback-row';

  const prompt = document.createElement('div');
  prompt.className = 'feedback-question';
  prompt.textContent = question;

  row.append(prompt, createStars(rating));
  return row;
}

export default function decorate(block) {
  const rows = [...block.children]
    .map((row) => [...row.children])
    .filter((cols) => cols.length);

  const items = rows
    .map((cols) => {
      const question = cols[0]?.textContent?.trim();
      const rating = clampRating(cols[1]?.textContent?.trim());
      return question ? { question, rating } : null;
    })
    .filter(Boolean);

  if (!items.length) {
    items.push(
      { question: 'How was the purchase process?', rating: 3 },
      { question: 'How did you like the products?', rating: 4 },
      { question: 'Was the shipping fast enough?', rating: 4 },
      { question: 'Will you do another shopping with us?', rating: 4 }
    );
  }

  block.textContent = '';
  block.classList.add('feedback');

  const list = document.createElement('div');
  list.className = 'feedback-list';

  items.forEach(({ question, rating }) => {
    list.append(createFeedbackRow(question, rating));
  });

  block.append(list);
}
