/**
 * Gacha Game Backend (Google Apps Script)
 * 
 * CORE FEATURES:
 * 1. User Management (Init/Login)
 * 2. Gacha Logic (Single/Ten draw) with Weighted Randomness
 * 3. Concurrency Control (LockService)
 * 4. Logging (Google Sheets)
 */

// --- CONFIGURATION ---
const SCRIPT_PROP = PropertiesService.getScriptProperties();
const SHEETS = {
  USERS: 'users',
  CHARACTERS: 'characters',
  LOGS: 'draw_logs',
  SUMMARY: 'draw_summary'
};

// --- API ENTRY POINTS ---

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000); // Wait up to 10s
  
  try {
    const params = JSON.parse(e.postData.contents);
    const action = params.action;
    
    let result = {};
    
    if (action === 'initUser') {
      result = initUser(params.userId);
    } else if (action === 'draw') {
      result = draw(params.userId, params.drawType, params.requestId);
    } else {
      throw new Error('Unknown action: ' + action);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: result
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } finally {
    lock.releaseLock();
  }
}

// --- CORE LOGIC ---

function initUser(userId) {
  if (!userId) throw new Error("Missing userId");
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEETS.USERS);
  
  // Find user
  const userData = userSheet.getDataRange().getValues(); // Cache this if large, but for now simple
  // Skip header
  let rowIndex = -1;
  let userRow = null;
  
  for (let i = 1; i < userData.length; i++) {
    if (String(userData[i][0]) === String(userId)) {
      rowIndex = i + 1; // 1-based index
      userRow = userData[i];
      break;
    }
  }
  
  const now = new Date();
  
  if (rowIndex !== -1) {
    // Info exists: Update login time
    userSheet.getRange(rowIndex, 4).setValue(now); // Column 4: lastLoginAt
    return {
      userId: userId,
      tickets: userRow[1], // Column 2: tickets
      characterPool: getCharacterPool(ss)
    };
  } else {
    // Create new user
    // userId, tickets (10), createdAt, lastLoginAt
    userSheet.appendRow([userId, 10, now, now]);
    return {
      userId: userId,
      tickets: 10,
      characterPool: getCharacterPool(ss)
    };
  }
}

function draw(userId, drawType, requestId) {
  // Validate Inputs
  if (!['single', 'ten'].includes(drawType)) throw new Error("Invalid drawType");
  const isTen = drawType === 'ten';
  const cost = isTen ? 10 : 1;
  const count = isTen ? 10 : 1;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName(SHEETS.USERS);
  
  // 1. Check User & Tickets
  const userData = userSheet.getDataRange().getValues();
  let rowIndex = -1;
  let currentTickets = 0;
  
  for (let i = 1; i < userData.length; i++) {
    if (String(userData[i][0]) === String(userId)) {
      rowIndex = i + 1;
      currentTickets = Number(userData[i][1]);
      break;
    }
  }
  
  if (rowIndex === -1) throw new Error("User not found");
  if (currentTickets < cost) throw new Error("Insufficient tickets");
  
  // 2. Perform Draw
  const pool = getCharacterPool(ss); // [{id, weight, ...}]
  const results = [];
  
  for (let i = 0; i < count; i++) {
    results.push(pickRandom(pool));
  }
  
  // 3. Deduct Tickets & Save
  const newTicketCount = currentTickets - cost;
  userSheet.getRange(rowIndex, 2).setValue(newTicketCount);
  
  // 4. Log Results
  const logSheet = ss.getSheetByName(SHEETS.LOGS);
  const now = new Date();
  const logRows = results.map((char, index) => [
    now,
    userId,
    drawType,
    cost,
    index + 1, // resultIndex
    char.charId,
    Math.random().toString(36).substring(7), // seed/rand audit
    requestId || ''
  ]);
  
  if (logRows.length > 0) {
    // Batch write logs
    logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, logRows[0].length).setValues(logRows);
  }
  
  // 5. Summary (Optional for Ten draw)
  if (isTen) {
     const summarySheet = ss.getSheetByName(SHEETS.SUMMARY);
     const summaryJson = JSON.stringify(results.map(r => r.charId));
     summarySheet.appendRow([now, userId, drawType, cost, summaryJson]);
  }
  
  return {
    ticketsAfter: newTicketCount,
    results: results,
    drawType: drawType
  };
}

// --- HELPERS ---

function getCharacterPool(ss) {
  const sheet = ss.getSheetByName(SHEETS.CHARACTERS || 'characters');
  const data = sheet.getDataRange().getValues();
  // Header: charId, name, rarity, weight, imageUrl, enabled
  const headers = data[0];
  const pool = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const enabled = row[5]; // Column 6
    if (enabled === true || String(enabled).toLowerCase() === 'true') {
      pool.push({
        charId: row[0],
        name: row[1],
        rarity: row[2],
        weight: Number(row[3]),
        imageUrl: row[4]
      });
    }
  }
  return pool;
}

function pickRandom(pool) {
  // Simple Weighted Random
  const totalWeight = pool.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const item of pool) {
    if (random < item.weight) {
      return item;
    }
    random -= item.weight;
  }
  return pool[pool.length - 1]; // Fallback
}

function setup() {
  // Helper to create sheets if they don't exist
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = [SHEETS.USERS, SHEETS.CHARACTERS, SHEETS.LOGS, SHEETS.SUMMARY];
  sheets.forEach(name => {
    if (!ss.getSheetByName(name)) ss.insertSheet(name);
  });
  
  // Init Headers
  const charSheet = ss.getSheetByName(SHEETS.CHARACTERS);
  if (charSheet.getLastRow() === 0) {
    charSheet.appendRow(['charId', 'name', 'rarity', 'weight', 'imageUrl', 'enabled']);
    // Seed initial data
    charSheet.appendRow(['jim', 'Jim', 'SSR', 10, '', true]);
    charSheet.appendRow(['wil', 'Wil', 'SR', 15, '', true]);
    charSheet.appendRow(['ken', 'Ken', 'R', 25, '', true]);
    charSheet.appendRow(['pal', 'Pal', 'R', 25, '', true]);
    charSheet.appendRow(['dan', 'Dan', 'R', 25, '', true]);
  }
  
  const usersSheet = ss.getSheetByName(SHEETS.USERS);
  if (usersSheet.getLastRow() === 0) {
    usersSheet.appendRow(['userId', 'tickets', 'createdAt', 'lastLoginAt']);
  }
  
  const logsSheet = ss.getSheetByName(SHEETS.LOGS);
  if (logsSheet.getLastRow() === 0) {
    logsSheet.appendRow(['timestamp', 'userId', 'drawType', 'cost', 'resultIndex', 'charId', 'rand', 'requestId']);
  }
}
