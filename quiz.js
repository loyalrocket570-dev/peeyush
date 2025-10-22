const quizData = [
  { question: "What does IPO stand for?", options: ["Initial Price Offering", "Initial Public Offering", "Internal Profit Order"], answer: "Initial Public Offering" },
  { question: "Which market is known as the secondary market?", options: ["Stock Exchange", "IPO Market", "Commodity Market"], answer: "Stock Exchange" },
  { question: "Which of these represents company ownership?", options: ["Bonds", "Stocks", "Mutual Funds"], answer: "Stocks" },
  { question: "What is a dividend?", options: ["Company profit distribution to shareholders", "A type of bond", "Stock split"], answer: "Company profit distribution to shareholders" },
  { question: "What does 'bull market' mean?", options: ["Prices are falling", "Prices are rising", "No change"], answer: "Prices are rising" },
  { question: "What is a ticker symbol?", options: ["A company's stock abbreviation", "A market index", "A bond rating"], answer: "A company's stock abbreviation" },
  { question: "What does 'market cap' measure?", options: ["Company market value", "Annual revenue", "Number of employees"], answer: "Company market value" },
  { question: "What is diversification?", options: ["Putting all money in one stock", "Spreading investments across assets", "Buying only bonds"], answer: "Spreading investments across assets" },
  { question: "What does 'ask' mean in a stock quote?", options: ["Price sellers want", "Price buyers offer", "Last trade price"], answer: "Price sellers want" },
  { question: "What is a stop-loss order?", options: ["Order to buy more", "Order to sell when price drops to a level", "Market maker tool"], answer: "Order to sell when price drops to a level" },
  { question: "Which instrument typically has fixed interest?", options: ["Stocks", "Bonds", "Options"], answer: "Bonds" },
  { question: "What is an ETF?", options: ["Exchange-Traded Fund", "Earnings Tracking Form", "Electronic Transfer File"], answer: "Exchange-Traded Fund" },
  { question: "What does P/E ratio stand for?", options: ["Price/Earnings ratio", "Profit/Earnings ratio", "Price/Equity ratio"], answer: "Price/Earnings ratio" },
  { question: "What is liquidity?", options: ["Ease of buying/selling an asset", "Amount of cash a company has", "Company profitability"], answer: "Ease of buying/selling an asset" },
  { question: "Which order executes immediately at current price?", options: ["Limit order", "Market order", "Stop order"], answer: "Market order" },
  { question: "What is a stock split?", options: ["Company issues more shares and lowers price per share", "Company buys back shares", "Company pays dividend"], answer: "Company issues more shares and lowers price per share" },
  { question: "What does 'diversity' in investing help reduce?", options: ["Transaction fees", "Risk", "Taxes"], answer: "Risk" },
  { question: "What is a blue-chip stock?", options: ["A small startup", "Large, established, financially sound company", "A penny stock"], answer: "Large, established, financially sound company" },
  { question: "Which is a defensive sector?", options: ["Utilities", "Luxury goods", "Travel"], answer: "Utilities" },
  { question: "What does 'yield' on a bond represent?", options: ["Bond's return based on interest", "Company revenue growth", "Stock volatility"], answer: "Bond's return based on interest" }
];

let current = 0;
let score = 0;
let selected = null;
const quizContainer = document.getElementById("quizContainer");
const nextBtn = document.getElementById("nextBtn");
const submitBtn = document.getElementById("submitBtn");

if (quizContainer && nextBtn && submitBtn) {
  function loadQuiz() {
    const q = quizData[current];
    quizContainer.innerHTML = `
      <div class="q-meta">Question ${current + 1} / ${quizData.length}</div>
      <h2>${q.question}</h2>
      <div class="options">
        ${q.options.map(opt => `<button class="optBtn" data-value="${opt}">${opt}</button>`).join("")}
      </div>
    `;

    selected = null;
    submitBtn.disabled = true;
    nextBtn.disabled = true;

    document.querySelectorAll('.optBtn').forEach(btn => {
      btn.addEventListener('click', () => {
        // mark selection visually
        document.querySelectorAll('.optBtn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selected = btn.dataset.value;
        submitBtn.disabled = false;
      });
    });
  }

  function revealAnswer() {
    const correct = quizData[current].answer;
    document.querySelectorAll('.optBtn').forEach(btn => {
      const val = btn.dataset.value;
      btn.classList.remove('selected');
      if (val === correct) btn.classList.add('correct');
      else if (val === selected) btn.classList.add('wrong');
    });
  }

  function showResults() {
    quizContainer.innerHTML = `
      <h2>Quiz Completed!</h2>
      <p>You got <strong>${score}</strong> out of <strong>${quizData.length}</strong> correct.</p>
      <p>Your score: <strong>${Math.round((score / quizData.length) * 100)}%</strong></p>
    `;
    submitBtn.style.display = 'none';
    nextBtn.textContent = 'Restart';
    nextBtn.dataset.state = 'finished';
    nextBtn.disabled = false;
  }

  submitBtn.addEventListener('click', () => {
    if (!selected) return;
    // check
    if (selected === quizData[current].answer) score++;
    revealAnswer();
    submitBtn.disabled = true;
    nextBtn.disabled = false;
  });

  nextBtn.addEventListener('click', () => {
    // restart
    if (nextBtn.dataset.state === 'finished') {
      current = 0; score = 0; selected = null; nextBtn.dataset.state = '';
      nextBtn.textContent = 'Next';
      submitBtn.style.display = '';
      loadQuiz();
      return;
    }

    // ensure submit was used
    if (!submitBtn.disabled) return; // still needs submit

    current++;
    if (current < quizData.length) {
      loadQuiz();
    } else {
      showResults();
    }
  });

  loadQuiz();
}
