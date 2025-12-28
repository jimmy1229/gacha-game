// Main App Logic
// Uses window.gachaApi provided by api.js

// State
const state = {
    user: null, // { userId, tickets }
    pool: [],
    isAnimating: false
};

// DOM Elements
const doc = document;
const screens = {
    loading: doc.getElementById('loading'),
    login: doc.getElementById('login-screen'),
    lobby: doc.getElementById('lobby-screen')
};
const ui = {
    summonAnimation: doc.querySelector('.summon-animation'),
    userIdInput: doc.getElementById('user-id-input'),
    startBtn: doc.getElementById('start-btn'),
    displayUserId: doc.getElementById('display-user-id'),
    ticketCount: doc.getElementById('ticket-count'),
    charPool: doc.getElementById('character-pool'),
    drawOneBtn: doc.getElementById('draw-one-btn'),
    drawTenBtn: doc.getElementById('draw-ten-btn'),
    gachaOverlay: doc.getElementById('gacha-overlay'),
    resultContainer: doc.getElementById('result-container'),
    resultGrid: doc.getElementById('result-grid'),
    closeResultBtn: doc.getElementById('close-result-btn'),
    errorMsg: doc.getElementById('error-message')
};

// Init
window.addEventListener('DOMContentLoaded', () => {
    switchScreen('login');
});

// Event Listeners
ui.startBtn.addEventListener('click', handleLogin);
ui.drawOneBtn.addEventListener('click', () => handleDraw('single', 1));
ui.drawTenBtn.addEventListener('click', () => handleDraw('ten', 10));
ui.closeResultBtn.addEventListener('click', closeResults);

async function handleLogin() {
    const userId = ui.userIdInput.value.trim();
    if (!userId) return;

    setLoading(true);
    const res = await window.gachaApi.initUser(userId);
    setLoading(false);

    if (res.status === 'success') {
        state.user = { userId: res.data.userId, tickets: res.data.tickets };
        state.pool = res.data.characterPool;
        renderLobby();
        switchScreen('lobby');
    } else {
        alert("Login failed: " + res.message);
    }
}

async function handleDraw(type, cost) {
    if (state.isAnimating) return;
    if (state.user.tickets < cost) {
        showError("NOT ENOUGH TICKETS");
        return;
    }

    state.isAnimating = true;
    showError(""); // Clear errors

    // UI Optimistic Update (Optional, but let's wait for server for strictness or play animation first)
    ui.summonAnimation.classList.remove('hidden'); // Show animation
    ui.resultContainer.classList.add('hidden'); // Ensure results are hidden
    ui.gachaOverlay.classList.remove('hidden');
    // Start summoning animation visuals here if you had a video/canvas

    const res = await window.gachaApi.draw(state.user.userId, type, cost);

    if (res.status === 'success') {
        // Dramatic delay for animation
        setTimeout(() => {
            state.user.tickets = res.data.ticketsAfter;
            updateTicketUI();

            // Hide animation, Show results
            ui.summonAnimation.classList.add('hidden');
            showResults(res.data.results);
            state.isAnimating = false;
        }, 2000);
    } else {
        ui.gachaOverlay.classList.add('hidden');
        showError(res.message);
        state.isAnimating = false;
    }
}

function showResults(results) {
    // Hide Summon Circle, Show Cards
    ui.resultContainer.classList.remove('hidden');
    ui.resultGrid.innerHTML = '';

    results.forEach((char, index) => {
        const card = document.createElement('div');
        // Add rarity and charId class for specific styling
        const rarityClass = char.rarity.toLowerCase();
        card.className = `result-card char-card ${rarityClass} ${char.charId}`;
        card.style.animationDelay = `${index * 0.1}s`; // Staggered reveal

        // Use placeholder if image fails or is empty
        const imgUrl = char.imageUrl || `https://via.placeholder.com/150/000000/FFFFFF?text=${char.charId}`;

        card.innerHTML = `
            <span class="badge ${rarityClass}">${char.rarity}</span>
            <img src="${imgUrl}" alt="${char.name}">
            <div class="info">
                <span class="name">${char.name}</span>
            </div>
        `;
        ui.resultGrid.appendChild(card);
    });

    // Render Summary if more than 1 result
    const summaryContainer = document.getElementById('result-summary') || createSummaryContainer();
    if (results.length > 1) {
        summaryContainer.classList.remove('hidden');
        renderSummary(results, summaryContainer);
    } else {
        summaryContainer.classList.add('hidden');
    }
}

function createSummaryContainer() {
    const div = document.createElement('div');
    div.id = 'result-summary';
    div.className = 'result-summary hidden';
    // Insert before the button
    ui.resultContainer.insertBefore(div, ui.closeResultBtn);
    return div;
}

function renderSummary(results, container) {
    const stats = {};
    results.forEach(r => {
        stats[r.name] = (stats[r.name] || 0) + 1;
    });

    // Sort by count desc, then name
    const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);

    container.innerHTML = `
        <h3>DRAW SUMMARY</h3>
        <ul>
            ${sorted.map(([name, count]) => `<li>${name} x${count}</li>`).join('')}
        </ul>
    `;
}

function closeResults() {
    ui.gachaOverlay.classList.add('hidden');
    ui.resultContainer.classList.add('hidden');
    // Clean up animation state
}

function renderLobby() {
    ui.displayUserId.textContent = state.user.userId;
    updateTicketUI();

    ui.charPool.innerHTML = state.pool.map(char => {
        const rarityClass = char.rarity.toLowerCase();
        return `
        <div class="char-card ${rarityClass} ${char.charId}">
            <span class="badge ${rarityClass}">${char.rarity}</span>
            <img src="${char.imageUrl || 'https://via.placeholder.com/120'}" alt="${char.name}">
            <div class="info">
                <span class="name">${char.name}</span>
                <span class="rate">${char.weight}%</span>
            </div>
        </div>
    `}).join('');
}

function updateTicketUI() {
    ui.ticketCount.textContent = state.user.tickets;
}

function switchScreen(name) {
    Object.values(screens).forEach(el => el.classList.add('hidden'));
    screens[name].classList.remove('hidden');
}

function setLoading(isLoading) {
    if (isLoading) {
        ui.startBtn.textContent = "CONNECTING...";
        ui.startBtn.disabled = true;
    } else {
        ui.startBtn.textContent = "START GAME";
        ui.startBtn.disabled = false;
    }
}

function showError(msg) {
    ui.errorMsg.textContent = msg;
    ui.errorMsg.classList.remove('hidden');
    if (msg) {
        setTimeout(() => ui.errorMsg.classList.add('hidden'), 3000);
    }
}
