/**
 * API Service
 * Handles communication with Google Apps Script or uses Mock Data.
 */

const CONFIG = {
    // Leave empty to force Mock Mode initially
    GAS_URL: '',
    MOCK_MODE: true, // Set to true to skip backend
    MOCK_DELAY: 800
};

// Mock Data
const MOCK_DB = {
    users: {},
    characters: [
        { charId: 'jim', name: 'Jim', weight: 10, imageUrl: 'asset/2.jpg', rarity: 'SSR' },
        { charId: 'wil', name: 'Wil', weight: 15, imageUrl: 'asset/1.jpg', rarity: 'SR' },
        { charId: 'ken', name: 'Ken', weight: 25, imageUrl: 'asset/3.jpg', rarity: 'R' },
        { charId: 'pal', name: 'Pal', weight: 25, imageUrl: 'asset/4.jpg', rarity: 'R' },
        { charId: 'dan', name: 'Dan', weight: 25, imageUrl: 'asset/5.jpg', rarity: 'R' }
    ]
};

async function apiCall(action, payload) {
    if (CONFIG.MOCK_MODE || !CONFIG.GAS_URL) {
        console.log(`[MOCK API] ${action}`, payload);
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(mockHandler(action, payload));
            }, CONFIG.MOCK_DELAY);
        });
    }

    // Real API Call
    try {
        const response = await fetch(CONFIG.GAS_URL, {
            method: 'POST',
            body: JSON.stringify({ action, ...payload })
        });
        const json = await response.json();
        return json;
    } catch (e) {
        console.error("API Error", e);
        return { status: 'error', message: 'Network Error' };
    }
}

// --- Mock Handlers ---

function mockHandler(action, payload) {
    if (action === 'initUser') {
        const { userId } = payload;
        if (!MOCK_DB.users[userId]) {
            MOCK_DB.users[userId] = { tickets: 100 }; // New user bonus: 100 Tickets!
        }
        return {
            status: 'success',
            data: {
                userId,
                tickets: MOCK_DB.users[userId].tickets,
                characterPool: MOCK_DB.characters
            }
        };
    }

    if (action === 'draw') {
        const { userId, drawType, cost } = payload;
        const user = MOCK_DB.users[userId];

        if (!user) return { status: 'error', message: 'User not found' };
        if (user.tickets < cost) return { status: 'error', message: 'INSUFFICIENT TICKETS' };

        // Deduct
        user.tickets -= cost;

        // Draw Logic
        const results = [];
        const count = drawType === 'ten' ? 10 : 1;

        for (let i = 0; i < count; i++) {
            results.push(weightedRandom(MOCK_DB.characters));
        }

        return {
            status: 'success',
            data: {
                ticketsAfter: user.tickets,
                results: results,
                drawType
            }
        };
    }
}

function weightedRandom(pool) {
    const total = pool.reduce((acc, item) => acc + item.weight, 0);
    let rand = Math.random() * total;
    for (const item of pool) {
        if (rand < item.weight) return item;
        rand -= item.weight;
    }
    return pool[0];
}

const apiMethods = {
    initUser: (userId) => apiCall('initUser', { userId }),
    draw: (userId, type, cost) => apiCall('draw', { userId, drawType: type, cost, requestId: crypto.randomUUID() })
};

// Expose to global scope for non-module usage
window.gachaApi = apiMethods;
