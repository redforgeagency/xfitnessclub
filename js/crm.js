const CRM_CONFIG = {
  AUTH_USER: 'xclub',
  AUTH_PASS: 'k8M#v9Qz!2Xw$7pL',
  SESSION_KEY: 'xfitness_auth_token_2026'
};

let tempPastDates = [];
let currentActiveHistoryClientId = null;

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initCRMData();
  initNavigation();
  initModals();
  initCategoryManagement();
  initEventListeners();
  renderAllViews();
  syncFromSupabase();
});

function initAuth() {
  const lockScreen = document.getElementById('authLockScreen');
  const authForm = document.getElementById('authForm');
  const authError = document.getElementById('authError');
  const logoutBtn = document.getElementById('crmLogoutBtn');

  const isAuthenticated = sessionStorage.getItem(CRM_CONFIG.SESSION_KEY) === 'authenticated';

  if (isAuthenticated) {
    if (lockScreen) lockScreen.classList.add('hidden');
  } else {
    if (lockScreen) lockScreen.classList.remove('hidden');
  }

  if (authForm) {
    authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const user = document.getElementById('authUsername')?.value.trim();
      const pass = document.getElementById('authPassword')?.value;

      if (user === CRM_CONFIG.AUTH_USER && pass === CRM_CONFIG.AUTH_PASS) {
        sessionStorage.setItem(CRM_CONFIG.SESSION_KEY, 'authenticated');
        if (authError) authError.style.display = 'none';
        if (lockScreen) lockScreen.classList.add('hidden');
        renderAllViews();
        syncFromSupabase();
      } else {
        if (authError) {
          authError.textContent = 'Date de autentificare incorecte. Verifică utilizatorul și parola.';
          authError.style.display = 'block';
        }
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem(CRM_CONFIG.SESSION_KEY);
      if (lockScreen) lockScreen.classList.remove('hidden');
      const authUser = document.getElementById('authUsername');
      const authPass = document.getElementById('authPassword');
      if (authUser) authUser.value = '';
      if (authPass) authPass.value = '';
    });
  }
}

function recalculateClientVisitsLeft(client) {
  if (!client) return 0;
  const isLimited = (client.plan || '').includes('Vizit');
  if (!isLimited) {
    client.visits_left = null;
    return null;
  }

  const total = client.total_visits_allowed || (client.plan.includes('8') ? 8 : (client.plan.includes('12') ? 12 : 1));
  client.total_visits_allowed = total;

  const visitsCount = Array.isArray(client.visits) ? client.visits.length : 0;
  client.visits_left = Math.max(0, total - visitsCount);

  if (client.visits_left === 0) {
    client.status = 'Expirat';
  } else {
    const now = Date.now();
    const expiryMs = parseDateToMS(client.expiresDate);
    if (expiryMs > 0 && expiryMs < now) {
      client.status = 'Expirat';
    } else {
      client.status = 'Activ';
    }
  }

  return client.visits_left;
}

function initCRMData() {
  if (!localStorage.getItem('xfitness_data_cleaned_v2')) {
    localStorage.setItem('xfitness_leads', JSON.stringify([]));
    localStorage.setItem('xfitness_clients', JSON.stringify([]));
    localStorage.setItem('xfitness_expenses', JSON.stringify([]));
    localStorage.setItem('xfitness_planned_expenses', JSON.stringify([]));
    localStorage.setItem('xfitness_custom_categories', JSON.stringify([]));
    localStorage.setItem('xfitness_data_cleaned_v2', 'true');
  }

  if (!localStorage.getItem('xfitness_planned_expenses')) {
    localStorage.setItem('xfitness_planned_expenses', JSON.stringify([]));
  }

  // Automatic Recalculation for all clients to ensure visits_left = total - visits.length
  try {
    const clients = JSON.parse(localStorage.getItem('xfitness_clients') || '[]');
    let modified = false;
    clients.forEach(c => {
      if ((c.plan || '').includes('Vizit')) {
        recalculateClientVisitsLeft(c);
        modified = true;
      }
    });
    if (modified) {
      localStorage.setItem('xfitness_clients', JSON.stringify(clients));
    }
  } catch {}
}

async function syncFromSupabase() {
  if (!window.dbClient) return;
  try {
    const [leads, clients, visits, expenses, plannedExpenses, categories, pricing] = await Promise.all([
      window.dbClient.getLeads ? window.dbClient.getLeads() : null,
      window.dbClient.getClients ? window.dbClient.getClients() : null,
      window.dbClient.getVisits ? window.dbClient.getVisits() : null,
      window.dbClient.getExpenses ? window.dbClient.getExpenses() : null,
      window.dbClient.getPlannedExpenses ? window.dbClient.getPlannedExpenses() : null,
      window.dbClient.getCategories ? window.dbClient.getCategories() : null,
      window.dbClient.getPricing ? window.dbClient.getPricing() : null
    ]);

    if (leads && Array.isArray(leads)) {
      localStorage.setItem('xfitness_leads', JSON.stringify(leads));
    }

    if (clients && Array.isArray(clients)) {
      const visitsByClient = {};
      if (visits && Array.isArray(visits)) {
        visits.forEach(v => {
          if (!visitsByClient[v.client_id]) visitsByClient[v.client_id] = [];
          visitsByClient[v.client_id].push({
            id: v.id,
            timestamp: v.timestamp || v.created_at || new Date().toISOString(),
            date: v.visit_date || v.date || '',
            time: v.visit_time || v.time || '12:00',
            plan: v.plan || '',
            notes: v.notes || ''
          });
        });
      }

      const normalizedClients = clients.map(c => {
        const clientVisits = visitsByClient[c.id] || (c.visits && Array.isArray(c.visits) ? c.visits : []);
        const totalAllowed = c.total_visits_allowed || (c.plan.includes('8 Vizite') ? 8 : (c.plan.includes('12 Vizite') ? 12 : (c.plan.includes('1 Vizit') ? 1 : null)));

        const clientObj = {
          id: c.id,
          name: c.name,
          phone: c.phone,
          plan: c.plan,
          price: Number(c.price) || 0,
          startDate: c.start_date || c.startDate || '',
          expiresDate: c.end_date || c.expiresDate || '',
          status: c.status || 'Activ',
          visits_left: c.visits_left,
          total_visits_allowed: totalAllowed,
          is_in_gym: Boolean(c.is_in_gym),
          last_checkin: c.last_checkin || null,
          visits: clientVisits
        };

        recalculateClientVisitsLeft(clientObj);

        // If Supabase had an outdated visits_left value, sync it back automatically
        if (c.visits_left !== clientObj.visits_left && window.dbClient?.updateClient) {
          window.dbClient.updateClient(clientObj.id, {
            visits_left: clientObj.visits_left,
            status: clientObj.status
          });
        }

        return clientObj;
      });
      localStorage.setItem('xfitness_clients', JSON.stringify(normalizedClients));
    }

    if (expenses && Array.isArray(expenses)) {
      const normalizedExpenses = expenses.map(e => ({
        id: e.id,
        description: e.title || e.description || '',
        category: e.category,
        amount: Number(e.amount),
        date: e.date,
        notes: e.notes || ''
      }));
      localStorage.setItem('xfitness_expenses', JSON.stringify(normalizedExpenses));
    }

    if (plannedExpenses && Array.isArray(plannedExpenses)) {
      const normalizedPlanned = plannedExpenses.map(p => ({
        id: p.id,
        description: p.title || p.description || '',
        category: p.category,
        amount: Number(p.amount),
        targetDate: p.target_date || p.targetDate || '',
        status: p.status || 'În Așteptare',
        notes: p.notes || ''
      }));
      localStorage.setItem('xfitness_planned_expenses', JSON.stringify(normalizedPlanned));
    }

    if (categories && Array.isArray(categories) && categories.length) {
      localStorage.setItem('xfitness_custom_categories', JSON.stringify(categories));
    }

    if (pricing && Object.keys(pricing).length) {
      localStorage.setItem('xfitness_pricing_config', JSON.stringify(pricing));
    }

    populateCategorySelects();
    populateTemplateSelects();
    renderAllViews();
  } catch (err) {
    console.warn('Sync from Supabase failed:', err);
  }
}

const DEFAULT_CATEGORIES = [
  'Salarii Personal',
  'Arendă Spațiu',
  'Energie Electrică & Încălzire',
  'Apă & Canalizare',
  'Mentenanță & Piese X-Line',
  'Consumabile & Igienă Vestiare',
  'Marketing & Social Media',
  'Echipamente & Accesorii Noi',
  'Servicii Juridice & Contabilitate',
  'Comisioane Bancare / POS',
  'Altele / Neprevăzute'
];

function getAllCategories() {
  try {
    const custom = JSON.parse(localStorage.getItem('xfitness_custom_categories') || '[]');
    const set = new Set([...DEFAULT_CATEGORIES, ...custom]);
    return Array.from(set);
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

function initCategoryManagement() {
  populateCategorySelects();

  const categorySelect = document.getElementById('newExpenseCategory');
  const customCatGroup = document.getElementById('customCategoryGroup');

  if (categorySelect && customCatGroup) {
    categorySelect.addEventListener('change', () => {
      if (categorySelect.value === '__NEW_CATEGORY__') {
        customCatGroup.style.display = 'block';
        document.getElementById('newExpenseCustomCategory')?.focus();
      } else {
        customCatGroup.style.display = 'none';
      }
    });
  }

  const plannedCatSelect = document.getElementById('newPlannedExpenseCategory');
  const plannedCustomGroup = document.getElementById('plannedCustomCategoryGroup');

  if (plannedCatSelect && plannedCustomGroup) {
    plannedCatSelect.addEventListener('change', () => {
      if (plannedCatSelect.value === '__NEW_CATEGORY__') {
        plannedCustomGroup.style.display = 'block';
        document.getElementById('newPlannedExpenseCustomCategory')?.focus();
      } else {
        plannedCustomGroup.style.display = 'none';
      }
    });
  }
}

function populateCategorySelects() {
  const categories = getAllCategories();
  const selectExpense = document.getElementById('newExpenseCategory');
  const selectPlanned = document.getElementById('newPlannedExpenseCategory');
  const filterExpense = document.getElementById('expenseCategoryFilter');

  if (selectExpense) {
    selectExpense.innerHTML = `
      ${categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('')}
      <option value="__NEW_CATEGORY__" style="color:var(--crm-red); font-weight:700;">+ Adaugă Categorie Personalizată...</option>
    `;
  }

  if (selectPlanned) {
    selectPlanned.innerHTML = `
      ${categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('')}
      <option value="__NEW_CATEGORY__" style="color:var(--crm-red); font-weight:700;">+ Adaugă Categorie Personalizată...</option>
    `;
  }

  if (filterExpense) {
    filterExpense.innerHTML = `
      <option value="ALL">Toate Categoriile</option>
      ${categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('')}
    `;
  }
}

function getLeads() {
  try {
    return JSON.parse(localStorage.getItem('xfitness_leads') || '[]');
  } catch {
    return [];
  }
}

function getClients() {
  try {
    const clients = JSON.parse(localStorage.getItem('xfitness_clients') || '[]');
    return clients.map(c => {
      const isLimited = (c.plan || '').includes('Vizit');
      let totalAllowed = c.total_visits_allowed;
      if (!totalAllowed && isLimited) {
        totalAllowed = c.plan.includes('8') ? 8 : (c.plan.includes('12') ? 12 : 1);
      }
      let left = c.visits_left;
      if (left === undefined || left === null) {
        left = totalAllowed !== undefined ? totalAllowed : null;
      }

      return {
        ...c,
        visits_left: left,
        total_visits_allowed: totalAllowed,
        visits: Array.isArray(c.visits) ? c.visits : [],
        is_in_gym: Boolean(c.is_in_gym)
      };
    });
  } catch {
    return [];
  }
}

function saveClients(clients) {
  localStorage.setItem('xfitness_clients', JSON.stringify(clients));
}

function getExpenses() {
  try {
    return JSON.parse(localStorage.getItem('xfitness_expenses') || '[]');
  } catch {
    return [];
  }
}

function getPlannedExpenses() {
  try {
    return JSON.parse(localStorage.getItem('xfitness_planned_expenses') || '[]');
  } catch {
    return [];
  }
}

function savePlannedExpenses(planned) {
  localStorage.setItem('xfitness_planned_expenses', JSON.stringify(planned));
}

// =============================================================================
// STREAK & VISIT CALCULATIONS (Strict 1-Visit Per Calendar Day + 14-Day Reset)
// =============================================================================

function parseDateToMS(dateStr, timestamp) {
  if (timestamp) {
    const parsed = new Date(timestamp).getTime();
    if (!isNaN(parsed)) return parsed;
  }
  if (!dateStr) return 0;

  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      return new Date(year, month, day, 12, 0, 0).getTime();
    }
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0).getTime();
      } else {
        return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10), 12, 0, 0).getTime();
      }
    }
  }

  const d = new Date(dateStr).getTime();
  return isNaN(d) ? 0 : d;
}

function calculateClientStreak(visits = []) {
  if (!Array.isArray(visits) || visits.length === 0) {
    return {
      streak: 0,
      isActive: false,
      totalVisits: 0,
      uniqueDaysCount: 0,
      lastVisitDateStr: 'Fără vizite',
      daysInactive: null,
      lastVisitFormatted: 'Nicio vizită'
    };
  }

  const parsedVisits = visits
    .map(v => ({
      ...v,
      ms: parseDateToMS(v.date, v.timestamp)
    }))
    .filter(v => v.ms > 0)
    .sort((a, b) => a.ms - b.ms);

  if (parsedVisits.length === 0) {
    return {
      streak: 0,
      isActive: false,
      totalVisits: visits.length,
      uniqueDaysCount: 0,
      lastVisitDateStr: 'Fără vizite',
      daysInactive: null,
      lastVisitFormatted: 'Nicio vizită'
    };
  }

  // Deduplicate visits to unique workout calendar days
  const distinctWorkouts = [];
  parsedVisits.forEach(v => {
    const dateKey = v.date || new Date(v.ms).toLocaleDateString('ro-RO');
    if (!distinctWorkouts.some(d => (d.date || '') === dateKey)) {
      distinctWorkouts.push(v);
    }
  });

  const MS_IN_DAY = 24 * 60 * 60 * 1000;
  const MAX_GAP_DAYS = 14;

  let currentStreak = 1;
  for (let i = 1; i < distinctWorkouts.length; i++) {
    const diffDays = (distinctWorkouts[i].ms - distinctWorkouts[i - 1].ms) / MS_IN_DAY;
    if (diffDays > MAX_GAP_DAYS) {
      currentStreak = 1;
    } else {
      currentStreak++;
    }
  }

  const lastVisit = distinctWorkouts[distinctWorkouts.length - 1];
  const now = new Date();
  const daysSinceLastVisit = (now.getTime() - lastVisit.ms) / MS_IN_DAY;

  let finalStreak = currentStreak;
  let isActive = true;

  if (daysSinceLastVisit > MAX_GAP_DAYS) {
    finalStreak = 0;
    isActive = false;
  }

  const lastVisitDateObj = new Date(lastVisit.ms);
  const isToday = now.toDateString() === lastVisitDateObj.toDateString();
  const yesterday = new Date(now.getTime() - MS_IN_DAY);
  const isYesterday = yesterday.toDateString() === lastVisitDateObj.toDateString();

  let lastVisitFormatted = lastVisit.date;
  if (isToday) {
    lastVisitFormatted = `Azi${lastVisit.time ? ', ' + lastVisit.time : ''}`;
  } else if (isYesterday) {
    lastVisitFormatted = `Ieri${lastVisit.time ? ', ' + lastVisit.time : ''}`;
  }

  return {
    streak: finalStreak,
    isActive,
    totalVisits: distinctWorkouts.length,
    uniqueDaysCount: distinctWorkouts.length,
    lastVisitDateStr: lastVisit.date,
    lastVisitFormatted,
    daysInactive: Math.floor(Math.max(0, daysSinceLastVisit))
  };
}

// =============================================================================
// SVG FLAME & TROPHY SYSTEM (5 Specific User-Defined Levels)
// =============================================================================

function getStreakTier(streak) {
  if (!streak || streak <= 0) return { id: 'cold', name: 'Inactiv', color: '#64748B' };
  if (streak < 10) return { id: 'warm', name: 'Activ', color: '#EA580C' };
  if (streak < 60) return { id: 'simple', name: 'Foc Simplu (10+)', color: '#F59E0B' };
  if (streak < 120) return { id: 'red', name: 'Foc Roșu Aprins (60+)', color: '#EF4444' };
  if (streak < 240) return { id: 'purple', name: 'Foc Mov Aprins (120+)', color: '#A855F7' };
  return { id: 'champion', name: 'Cupa Campionilor (240+)', color: '#D97706' };
}

function getStreakIconSVG(tierId, size = 15) {
  if (tierId === 'cold') {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  }
  if (tierId === 'warm') {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="#EA580C"><path d="M12 2c-.5 2-2 3.5-3.5 5-2 2-3.5 4.5-3.5 8 0 4.4 3.6 8 8 8s8-3.6 8-8c0-3.5-1.5-6-3.5-8-1.5-1.5-3-3-3.5-5-.3 1.5-1.2 2.7-2 3.5C11.5 4.5 12 3 12 2z"/></svg>`;
  }
  if (tierId === 'simple') {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="#F59E0B"><path d="M12 2c-.5 2-2 3.5-3.5 5-2 2-3.5 4.5-3.5 8 0 4.4 3.6 8 8 8s8-3.6 8-8c0-3.5-1.5-6-3.5-8-1.5-1.5-3-3-3.5-5-.3 1.5-1.2 2.7-2 3.5C11.5 4.5 12 3 12 2zm1 14.5c0 1.9-1.3 3.5-3 3.5s-3-1.6-3-3.5c0-1.5 1-2.8 2-3.5.5 1 1.2 1.5 2 1.5s1.5-.5 2-1.5c.6.7 1 1.8 1 3.5z"/></svg>`;
  }
  if (tierId === 'red') {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="#EF4444"><path d="M12 1c-1 3-3.5 5-5 7-2.5 2.5-4 5.5-4 9.5 0 5 4 9 9 9s9-4 9-9c0-4-1.5-7-4-9.5-1.5-2-4-4-5-7zm0 10c1.5 1.5 2.5 3 2.5 5 0 2.5-1.8 4.5-4 4.5s-4-2-4-4.5c0-2 1-3.5 2.5-5 .5 1.2 1.5 2 2.5 2s2-.8 2.5-2H12z"/></svg>`;
  }
  if (tierId === 'purple') {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="#A855F7"><path d="M12 1c-1 3-3.5 5-5 7-2.5 2.5-4 5.5-4 9.5 0 5 4 9 9 9s9-4 9-9c0-4-1.5-7-4-9.5-1.5-2-4-4-5-7zm0 10c1.5 1.5 2.5 3 2.5 5 0 2.5-1.8 4.5-4 4.5s-4-2-4-4.5c0-2 1-3.5 2.5-5 .5 1.2 1.5 2 2.5 2s2-.8 2.5-2H12z"/></svg>`;
  }
  if (tierId === 'champion') {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="#F59E0B" stroke="#B45309" stroke-width="0.5"><path d="M6 2h12v3a6 6 0 0 1-5 5.91V14h3a1 1 0 0 1 1 1v1H7v-1a1 1 0 0 1 1-1h3v-3.09A6 6 0 0 1 6 5V2zm-2 2H2v3a4 4 0 0 0 4 4v-2a2 2 0 0 1-2-2V4zm16 0h2v3a2 2 0 0 1-2 2V9a4 4 0 0 0 4-4V4h-4zm-8 14h4v2H8v-2h4z"/></svg>`;
  }
  return '';
}

function getStreakBadgeHTML(streakInfo) {
  const tier = getStreakTier(streakInfo.streak);
  const icon = getStreakIconSVG(tier.id, 15);

  if (streakInfo.streak > 0) {
    return `<span class="streak-badge streak-tier-${tier.id}" title="${tier.name}">${icon} <span>${streakInfo.streak} ${streakInfo.streak === 1 ? 'vizită' : 'vizite'}</span></span>`;
  } else {
    return `<span class="streak-badge streak-tier-cold" title="Nicio vizită în ultimele 14 zile">${icon} <span>0 (Pauză >14z)</span></span>`;
  }
}

function formatDateRO(d = new Date()) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function formatTimeRO(d = new Date()) {
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getDayOfWeekRO(dateStr, timestamp) {
  const ms = parseDateToMS(dateStr, timestamp);
  if (!ms) return '—';
  const d = new Date(ms);
  const days = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  return days[d.getDay()];
}

// =============================================================================
// AUTOMATIC EXPIRY DATE CALCULATION
// =============================================================================

function calculateExpiryDateISO(startDateISO, plan) {
  if (!startDateISO) return '';
  const parts = startDateISO.split('-');
  if (parts.length !== 3) return '';

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return '';

  if (plan.includes('12 Luni')) {
    d.setFullYear(d.getFullYear() + 1);
  } else if (plan.includes('6 Luni')) {
    d.setMonth(d.getMonth() + 6);
  } else if (plan.includes('3 Luni')) {
    d.setMonth(d.getMonth() + 3);
  } else {
    // 1 Lună, 8 Vizite, 12 Vizite, 1 Vizită, Antrenament Individual -> +1 Lună
    d.setMonth(d.getMonth() + 1);
  }

  const resYear = d.getFullYear();
  const resMonth = String(d.getMonth() + 1).padStart(2, '0');
  const resDay = String(d.getDate()).padStart(2, '0');

  return `${resYear}-${resMonth}-${resDay}`;
}

function updateAutoExpiryDate() {
  const startInput = document.getElementById('newClientStartDateCustom');
  const endInput = document.getElementById('newClientEndDateCustom');
  const planSelect = document.getElementById('newClientPlan');

  if (!startInput || !endInput || !planSelect) return;

  if (!startInput.value) {
    startInput.value = new Date().toISOString().slice(0, 10);
  }

  const expiry = calculateExpiryDateISO(startInput.value, planSelect.value);
  if (expiry) {
    endInput.value = expiry;
  }
}

function updateVisitsBalanceInputs() {
  const plan = document.getElementById('newClientPlan')?.value || '';
  const isLimited = plan.includes('Vizit');
  const visitsRow = document.getElementById('existingVisitsBalanceRow');
  const unlimitedRow = document.getElementById('unlimitedHistoryVisitsRow');

  if (isLimited) {
    if (visitsRow) visitsRow.style.display = 'grid';
    if (unlimitedRow) unlimitedRow.style.display = 'none';

    const total = plan.includes('8 Vizite') ? 8 : (plan.includes('12 Vizite') ? 12 : 1);
    const completedInput = document.getElementById('newClientCompletedVisitsCount');
    const remainingInput = document.getElementById('newClientRemainingVisitsCustom');

    let completed = parseInt(completedInput?.value, 10);
    if (isNaN(completed) || completed < 0) completed = 0;

    const remaining = Math.max(0, total - completed);
    if (remainingInput) remainingInput.value = remaining;
  } else {
    if (visitsRow) visitsRow.style.display = 'none';
    if (unlimitedRow) unlimitedRow.style.display = 'block';
  }
}

// =============================================================================
// KPI CALCULATIONS & RENDERING
// =============================================================================

function calculateKPIs() {
  const clients = getClients();
  const leads = getLeads();
  const expenses = getExpenses();

  const activeClientsCount = clients.filter(c => c.status === 'Activ').length;
  const inGymClientsCount = clients.filter(c => c.is_in_gym).length;
  const totalGrossRevenue = clients.reduce((sum, c) => sum + (Number(c.price) || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netProfit = totalGrossRevenue - totalExpenses;
  const profitMargin = totalGrossRevenue > 0 ? ((netProfit / totalGrossRevenue) * 100).toFixed(1) : 0;
  const newLeadsCount = leads.filter(l => l.status === 'Nou').length;

  return {
    totalMembers: activeClientsCount,
    activeClientsCount,
    inGymClientsCount,
    totalGrossRevenue,
    totalExpenses,
    netProfit,
    profitMargin,
    newLeadsCount,
    totalLeadsCount: leads.length
  };
}

function renderAllViews() {
  renderKPIs();
  renderDashboardRecentTables();
  renderLiveAttendanceTable();
  renderLeadsTable();
  renderClientsTable();
  renderFollowupTable();
  renderExpensesTable();
  renderPlannedExpensesTable();
  renderExpenseCategoryBars();
}

function renderKPIs() {
  const kpi = calculateKPIs();

  const elProfit = document.getElementById('kpiNetProfit');
  const elRevenue = document.getElementById('kpiGrossRevenue');
  const elExpenses = document.getElementById('kpiTotalExpenses');
  const elMembers = document.getElementById('kpiTotalMembers');
  const elMargin = document.getElementById('kpiMarginBadge');
  const inGymNum = document.getElementById('inGymCountNum');

  if (elProfit) elProfit.textContent = `${kpi.netProfit.toLocaleString('ro-RO')} Lei`;
  if (elRevenue) elRevenue.textContent = `${kpi.totalGrossRevenue.toLocaleString('ro-RO')} Lei`;
  if (elExpenses) elExpenses.textContent = `${kpi.totalExpenses.toLocaleString('ro-RO')} Lei`;
  if (elMembers) elMembers.textContent = `${kpi.activeClientsCount}`;
  if (elMargin) elMargin.textContent = `Marjă: ${kpi.profitMargin}%`;
  if (inGymNum) inGymNum.textContent = `${kpi.inGymClientsCount}`;

  const leadBadge = document.getElementById('navLeadsBadge');
  if (leadBadge) {
    if (kpi.newLeadsCount > 0) {
      leadBadge.textContent = kpi.newLeadsCount;
      leadBadge.style.display = 'inline-block';
    } else {
      leadBadge.style.display = 'none';
    }
  }
}

function renderDashboardRecentTables() {
  const recentLeads = getLeads().slice(0, 5);
  const tbody = document.getElementById('recentLeadsTableBody');
  if (!tbody) return;

  if (recentLeads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--crm-text-muted); padding: 1.5rem;">Nu sunt cereri noi înregistrate.</td></tr>`;
    return;
  }

  tbody.innerHTML = recentLeads.map(l => {
    let statusClass = 'status-new';
    if (l.status === 'Contactat') statusClass = 'status-contacted';
    if (l.status === 'Confirmat') statusClass = 'status-confirmed';

    return `
      <tr>
        <td><strong>${escapeHTML(l.name)}</strong><br><span style="font-size:0.75rem; color:var(--crm-text-muted);">${escapeHTML(l.phone)}</span></td>
        <td><span style="font-weight:700; color:var(--crm-red);">${escapeHTML(l.plan)}</span></td>
        <td><span style="font-size:0.78rem; color:var(--crm-text-muted);">${l.date}</span></td>
        <td><span class="status-badge ${statusClass}">${l.status}</span></td>
        <td>
          <a href="tel:${l.phone.replace(/\s+/g, '')}" class="table-action-btn btn-call" title="Apelează">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
            Apel
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

function renderExpenseCategoryBars() {
  const expenses = getExpenses();
  const container = document.getElementById('expenseCategoryBars');
  if (!container) return;

  const total = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  if (total === 0) {
    container.innerHTML = `<p style="color:var(--crm-text-muted); font-size:0.85rem; padding: 1rem 0;">Fără cheltuieli înregistrate în această perioadă.</p>`;
    return;
  }

  const categories = {};
  expenses.forEach(e => {
    const cat = e.category || 'Altele / Neprevăzute';
    categories[cat] = (categories[cat] || 0) + Number(e.amount);
  });

  const colors = ['#E50914', '#3B82F6', '#F59E0B', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'];

  container.innerHTML = Object.entries(categories).map(([cat, amt], idx) => {
    const pct = ((amt / total) * 100).toFixed(1);
    const color = colors[idx % colors.length];

    return `
      <div class="expense-category-row">
        <div class="expense-category-info">
          <span>${escapeHTML(cat)}</span>
          <span><strong>${amt.toLocaleString('ro-RO')} Lei</strong> (${pct}%)</span>
        </div>
        <div class="expense-progress-track">
          <div class="expense-progress-bar" style="width: ${pct}%; background-color: ${color};"></div>
        </div>
      </div>
    `;
  }).join('');
}

// =============================================================================
// LIVE ATTENDANCE & CHECK-IN TABLE (DASHBOARD)
// =============================================================================

function renderLiveAttendanceTable() {
  const clients = getClients();
  const tbody = document.getElementById('liveAttendanceTableBody');
  const searchInput = document.getElementById('attendanceSearchInput');
  const filterSelect = document.getElementById('attendanceStatusFilter');
  if (!tbody) return;

  const query = (searchInput?.value || '').toLowerCase().trim();
  const filter = filterSelect?.value || 'ALL';

  const filtered = clients.filter(c => {
    const nameMatch = (c.name || '').toLowerCase().includes(query);
    const phoneMatch = (c.phone || '').toLowerCase().includes(query);
    const planMatch = (c.plan || '').toLowerCase().includes(query);
    const matchesQuery = nameMatch || phoneMatch || planMatch;

    if (!matchesQuery) return false;

    if (filter === 'IN_GYM') return Boolean(c.is_in_gym);
    if (filter === 'OUT_GYM') return !c.is_in_gym;
    if (filter === 'STREAK') {
      const st = calculateClientStreak(c.visits);
      return st.streak > 0;
    }
    if (filter === 'VISITS_PASS') {
      return (c.plan || '').includes('Vizit');
    }
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; color:var(--crm-text-muted); padding:2rem;">
          Niciun client găsit conform filtrelor selectate.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const streakInfo = calculateClientStreak(c.visits);
    const isLimitedPass = (c.plan || '').includes('Vizit');

    // Status in Gym Pill
    let gymStatusHTML = '';
    if (c.is_in_gym) {
      gymStatusHTML = `<span class="status-badge status-training"><span class="live-dot"></span> Se antrenează</span>`;
    } else {
      gymStatusHTML = `<span class="status-badge status-out">În afara sălii</span>`;
    }

    // Visits balance
    let visitsHTML = '';
    if (isLimitedPass) {
      const left = c.visits_left !== undefined && c.visits_left !== null ? c.visits_left : 0;
      const total = c.total_visits_allowed || (c.plan.includes('8') ? 8 : (c.plan.includes('12') ? 12 : 1));
      const pct = total > 0 ? Math.min(100, Math.max(0, (left / total) * 100)) : 0;
      let fillClass = '';
      if (left <= 2 && left > 0) fillClass = 'warning';
      if (left === 0) fillClass = 'danger';

      visitsHTML = `
        <div class="visits-pill">
          <span class="visits-text" style="${left === 0 ? 'color:var(--crm-red);' : ''}">${left} din ${total} rămase</span>
          <div class="visits-mini-bar">
            <div class="visits-mini-fill ${fillClass}" style="width:${pct}%;"></div>
          </div>
        </div>
      `;
    } else {
      visitsHTML = `
        <span style="font-weight:700; color:var(--crm-text-main);">
          Nelimitat <span style="font-size:0.75rem; color:var(--crm-text-muted); font-weight:600;">(${streakInfo.totalVisits} efectuate)</span>
        </span>
      `;
    }

    // Streak badge
    const streakHTML = getStreakBadgeHTML(streakInfo);

    // Action button: Check-in or Check-out (both equal size to History)
    let toggleBtnHTML = '';
    if (c.is_in_gym) {
      toggleBtnHTML = `
        <button class="table-action-btn btn-checkout" onclick="handleClientCheckOut('${c.id}')" title="Încheie antrenamentul (Plecat)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
          Check-out
        </button>
      `;
    } else {
      toggleBtnHTML = `
        <button class="table-action-btn btn-checkin" onclick="handleClientCheckIn('${c.id}')" title="Înregistrează intrarea la sală">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          Check-in
        </button>
      `;
    }

    return `
      <tr>
        <td>
          <strong>${escapeHTML(c.name)}</strong><br>
          <a href="tel:${c.phone.replace(/\s+/g, '')}" style="font-size:0.75rem; color:var(--crm-text-muted); text-decoration:none;">${escapeHTML(c.phone)}</a>
        </td>
        <td><span style="font-weight:700; color:var(--crm-red);">${escapeHTML(c.plan)}</span></td>
        <td>${gymStatusHTML}</td>
        <td>${visitsHTML}</td>
        <td>${streakHTML}</td>
        <td><span style="font-size:0.8rem; font-weight:600; color:var(--crm-text-main);">${streakInfo.lastVisitFormatted}</span></td>
        <td>
          <div style="display:flex; gap:0.5rem; align-items:center;">
            ${toggleBtnHTML}
            <button class="table-action-btn btn-history" onclick="openClientHistoryModal('${c.id}')" title="Deschide Profil & Istoric Vizite">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
              Istoric
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// =============================================================================
// CLIENTS MANAGEMENT TABLE
// =============================================================================

function renderClientsTable() {
  const clients = getClients();
  const tbody = document.getElementById('allClientsTableBody');
  const searchInput = document.getElementById('clientSearchInput');
  const filterSelect = document.getElementById('clientStatusFilter');
  if (!tbody) return;

  const query = (searchInput?.value || '').toLowerCase().trim();
  const filter = filterSelect?.value || 'ALL';

  const filtered = clients.filter(c => {
    const matchesQuery = (c.name || '').toLowerCase().includes(query) ||
      (c.phone || '').toLowerCase().includes(query) ||
      (c.plan || '').toLowerCase().includes(query);

    if (!matchesQuery) return false;

    if (filter === 'IN_GYM') return Boolean(c.is_in_gym);
    if (filter === 'Activ') return c.status === 'Activ';
    if (filter === 'Expirat') return c.status === 'Expirat';
    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: var(--crm-text-muted); padding: 2rem;">Niciun client înregistrat. Apasă butonul „Adaugă Client Nou” pentru a începe.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const statusClass = c.status === 'Activ' ? 'status-active' : 'status-expired';
    const streakInfo = calculateClientStreak(c.visits);
    const isLimitedPass = (c.plan || '').includes('Vizit');

    let gymStatusHTML = c.is_in_gym
      ? `<span class="status-badge status-training"><span class="live-dot"></span> În sală</span>`
      : `<span class="status-badge status-out">În afară</span>`;

    let visitsHTML = '';
    if (isLimitedPass) {
      const left = c.visits_left !== undefined && c.visits_left !== null ? c.visits_left : 0;
      const total = c.total_visits_allowed || (c.plan.includes('8') ? 8 : (c.plan.includes('12') ? 12 : 1));
      visitsHTML = `<strong>${left}/${total}</strong> rămase`;
    } else {
      visitsHTML = `Nelimitat (${streakInfo.totalVisits} vizite)`;
    }

    const streakHTML = getStreakBadgeHTML(streakInfo);

    return `
      <tr>
        <td><strong>${escapeHTML(c.name)}</strong></td>
        <td><a href="tel:${c.phone.replace(/\s+/g, '')}" style="color:inherit; font-weight:600;">${escapeHTML(c.phone)}</a></td>
        <td><span style="font-weight:700;">${escapeHTML(c.plan)}</span></td>
        <td>${gymStatusHTML}</td>
        <td><span style="font-size:0.82rem;">${visitsHTML}</span></td>
        <td>${streakHTML}</td>
        <td><span style="font-size:0.8rem; color:var(--crm-text-muted);">${c.startDate} — ${c.expiresDate}</span></td>
        <td><span class="status-badge ${statusClass}">${c.status}</span></td>
        <td>
          <div style="display:flex; gap:0.4rem;">
            <button class="table-action-btn btn-viber btn-icon-only" onclick="openSendNotificationModal('${c.id}', 'viber')" title="Trimite Notificare Viber / SMS">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M20.4 4.6C18.6 2.8 15.8 2 12.3 2 7.7 2 3.8 3.5 2.6 7.4c-.8 2.8-.2 5.5 1.5 7.6l-.8 3.1c-.2.8.5 1.5 1.3 1.3l3.2-.8c1.4.7 3 1.1 4.5 1.1 4.6 0 8.5-1.5 9.7-5.4 1.2-3.9.3-7.8-1.6-9.7zm-2.8 9.9c-.3.9-1.5 1.6-2.5 1.6-1.1 0-2.8-.8-4.7-2.7-1.9-1.9-2.7-3.6-2.7-4.7 0-1 .7-2.2 1.6-2.5.4-.1.8 0 1 .3l1.1 1.7c.2.4.2.8 0 1.1l-.5.7c-.2.2-.2.5 0 .7.6 1 1.4 1.8 2.4 2.4.2.2.5.2.7 0l.7-.5c.3-.2.7-.2 1.1 0l1.7 1.1c.3.3.4.7.2 1.1z"/></svg>
            </button>
            <button class="table-action-btn btn-history" onclick="openClientHistoryModal('${c.id}')" title="Istoric & Profil">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>
              Istoric
            </button>
            <button class="table-action-btn btn-delete btn-icon-only" onclick="deleteClient('${c.id}')" title="Șterge Client">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// =============================================================================
// CHECK-IN & CHECK-OUT ACTION HANDLERS (With Same-Day Spam Prevention)
// =============================================================================

window.handleClientCheckIn = async function(clientId) {
  const clients = getClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return;

  const isLimited = (client.plan || '').includes('Vizit');
  const now = new Date();
  const todayStr = formatDateRO(now);

  if (!Array.isArray(client.visits)) client.visits = [];
  const alreadyVisitedToday = client.visits.some(v => v.date === todayStr);

  if (!alreadyVisitedToday) {
    if (isLimited) {
      if (client.visits_left !== undefined && client.visits_left <= 0) {
        const confirmExtra = confirm(`Atenție: Clientul ${client.name} nu mai are vizite disponibile pe abonamentul actual (0 rămase)!\n\nDoriți totuși să înregistrați intrarea la sală?`);
        if (!confirmExtra) return;
      } else {
        const currentLeft = client.visits_left !== undefined && client.visits_left !== null ? client.visits_left : (client.total_visits_allowed || 8);
        client.visits_left = Math.max(0, currentLeft - 1);
        if (client.visits_left === 0) {
          client.status = 'Expirat';
        }
      }
    }

    const visitItem = {
      id: 'VIS-' + Date.now().toString(36).toUpperCase(),
      timestamp: now.toISOString(),
      date: todayStr,
      time: formatTimeRO(now),
      plan: client.plan,
      notes: 'Check-in Recepție'
    };

    client.visits.unshift(visitItem);
    recalculateClientVisitsLeft(client);

    if (window.dbClient?.insertVisit) {
      window.dbClient.insertVisit({
        id: visitItem.id,
        client_id: client.id,
        visit_date: visitItem.date,
        visit_time: visitItem.time,
        timestamp: visitItem.timestamp,
        plan: visitItem.plan,
        notes: visitItem.notes
      });
    }
  } else {
    const todayVisit = client.visits.find(v => v.date === todayStr);
    if (todayVisit && !todayVisit.time) {
      todayVisit.time = formatTimeRO(now);
    }
  }

  client.is_in_gym = true;
  client.last_checkin = now.toISOString();

  saveClients(clients);
  renderAllViews();

  if (currentActiveHistoryClientId === clientId) {
    renderClientHistoryModal();
  }

  if (window.dbClient?.updateClient) {
    window.dbClient.updateClient(client.id, {
      is_in_gym: true,
      last_checkin: client.last_checkin,
      visits_left: client.visits_left,
      status: client.status
    });
  }
};

window.handleClientCheckOut = async function(clientId) {
  const clients = getClients();
  const client = clients.find(c => c.id === clientId);
  if (!client) return;

  client.is_in_gym = false;
  saveClients(clients);
  renderAllViews();

  if (currentActiveHistoryClientId === clientId) {
    renderClientHistoryModal();
  }

  if (window.dbClient?.updateClient) {
    window.dbClient.updateClient(client.id, {
      is_in_gym: false
    });
  }
};

// =============================================================================
// CLIENT PROFILE & HISTORY MODAL + CALENDAR VIEW
// =============================================================================

let currentHistoryCalendarDate = new Date();

window.openClientHistoryModal = function(clientId) {
  currentActiveHistoryClientId = clientId;
  currentHistoryCalendarDate = new Date();
  renderClientHistoryModal();
  showHistoryTab('tabVisitsList');
  openModal('clientHistoryModal');
};

function renderClientHistoryModal() {
  if (!currentActiveHistoryClientId) return;
  const clients = getClients();
  const client = clients.find(c => c.id === currentActiveHistoryClientId);
  if (!client) return;

  // Auto-recalculate visits left based on # of visits in history
  recalculateClientVisitsLeft(client);

  const streakInfo = calculateClientStreak(client.visits);
  const isLimited = (client.plan || '').includes('Vizit');

  const elName = document.getElementById('histModalClientName');
  const elPhone = document.getElementById('histModalClientPhone');
  const elPlan = document.getElementById('histModalClientPlan');
  const elVal = document.getElementById('histModalClientValidity');
  const elLiveStatus = document.getElementById('histModalLiveStatus');
  const elQuickAction = document.getElementById('histModalQuickToggleAction');

  if (elName) elName.textContent = client.name;
  if (elPhone) elPhone.textContent = client.phone;
  if (elPlan) elPlan.textContent = client.plan;
  if (elVal) elVal.textContent = `Valabilitate: ${client.startDate || '—'} — ${client.expiresDate || '—'} • Status: ${client.status}`;

  if (elLiveStatus) {
    if (client.is_in_gym) {
      elLiveStatus.innerHTML = `<span class="status-badge status-training"><span class="live-dot"></span> În sală acum</span>`;
    } else {
      elLiveStatus.innerHTML = `<span class="status-badge status-out">În afara sălii</span>`;
    }
  }

  if (elQuickAction) {
    let checkinBtn = '';
    if (client.is_in_gym) {
      checkinBtn = `
        <button type="button" class="crm-btn crm-btn-secondary crm-btn-sm" onclick="handleClientCheckOut('${client.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="4" y="4" width="16" height="16" rx="2"></rect></svg>
          Check-out
        </button>
      `;
    } else {
      checkinBtn = `
        <button type="button" class="crm-btn crm-btn-primary crm-btn-sm" onclick="handleClientCheckIn('${client.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          Check-in
        </button>
      `;
    }

    elQuickAction.innerHTML = `
      <div style="display:flex; gap:0.5rem; justify-content:flex-end;">
        <button type="button" class="crm-btn crm-btn-viber crm-btn-sm" onclick="openSendNotificationModal('${client.id}', 'viber')" title="Trimite Notificare Viber">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M20.4 4.6C18.6 2.8 15.8 2 12.3 2 7.7 2 3.8 3.5 2.6 7.4c-.8 2.8-.2 5.5 1.5 7.6l-.8 3.1c-.2.8.5 1.5 1.3 1.3l3.2-.8c1.4.7 3 1.1 4.5 1.1 4.6 0 8.5-1.5 9.7-5.4 1.2-3.9.3-7.8-1.6-9.7zm-2.8 9.9c-.3.9-1.5 1.6-2.5 1.6-1.1 0-2.8-.8-4.7-2.7-1.9-1.9-2.7-3.6-2.7-4.7 0-1 .7-2.2 1.6-2.5.4-.1.8 0 1 .3l1.1 1.7c.2.4.2.8 0 1.1l-.5.7c-.2.2-.2.5 0 .7.6 1 1.4 1.8 2.4 2.4.2.2.5.2.7 0l.7-.5c.3-.2.7-.2 1.1 0l1.7 1.1c.3.3.4.7.2 1.1z"/></svg>
          Viber
        </button>
        ${checkinBtn}
      </div>
    `;
  }

  // Stat Boxes
  const elStreakVal = document.getElementById('histModalStreakVal');
  const elStreakSub = document.getElementById('histModalStreakSub');
  const elVisitsVal = document.getElementById('histModalVisitsVal');
  const elVisitsSub = document.getElementById('histModalVisitsSub');
  const elTotalVisitsVal = document.getElementById('histModalTotalVisitsVal');
  const elLastVisitSub = document.getElementById('histModalLastVisitSub');

  const tier = getStreakTier(streakInfo.streak);
  const icon = getStreakIconSVG(tier.id, 22);

  if (elStreakVal) {
    elStreakVal.innerHTML = `<span style="display:flex; align-items:center; gap:0.4rem; color:${tier.color};">${icon} <span>${streakInfo.streak}</span></span>`;
  }
  if (elStreakSub) {
    if (streakInfo.streak > 0) {
      elStreakSub.textContent = `${tier.name} • Ultima: ${streakInfo.lastVisitFormatted}`;
    } else {
      elStreakSub.textContent = streakInfo.daysInactive !== null
        ? `Inactiv de ${streakInfo.daysInactive} zile (resetat la >14z)`
        : 'Fără vizite înregistrate';
    }
  }

  if (elVisitsVal) {
    if (isLimited) {
      const tot = client.total_visits_allowed || (client.plan.includes('8') ? 8 : (client.plan.includes('12') ? 12 : 1));
      const left = client.visits_left !== undefined && client.visits_left !== null ? client.visits_left : Math.max(0, tot - (client.visits?.length || 0));
      elVisitsVal.textContent = `${left} / ${tot} rămase`;
    } else {
      elVisitsVal.textContent = 'Nelimitat';
    }
  }
  if (elVisitsSub) {
    elVisitsSub.textContent = `${streakInfo.totalVisits} vizite unice efectuate`;
  }

  if (elTotalVisitsVal) elTotalVisitsVal.textContent = `${streakInfo.totalVisits}`;
  if (elLastVisitSub) elLastVisitSub.textContent = `Ultima: ${streakInfo.lastVisitFormatted}`;

  // Visits Table Body
  const visitsTbody = document.getElementById('histModalVisitsTableBody');
  if (visitsTbody) {
    if (!client.visits || client.visits.length === 0) {
      visitsTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--crm-text-muted); padding:1.5rem;">Nicio vizită înregistrată încă în istoric.</td></tr>`;
    } else {
      visitsTbody.innerHTML = client.visits.map((v, idx) => {
        const dayOfWeek = getDayOfWeekRO(v.date, v.timestamp);
        return `
          <tr>
            <td><strong>#${client.visits.length - idx}</strong></td>
            <td><strong>${escapeHTML(v.date)}</strong></td>
            <td><span style="color:var(--crm-text-muted); font-size:0.8rem;">${dayOfWeek}</span></td>
            <td><span style="font-weight:700;">${escapeHTML(v.time || '—')}</span></td>
            <td><span style="font-size:0.8rem; color:var(--crm-red); font-weight:700;">${escapeHTML(v.plan || client.plan)}</span></td>
            <td><span style="font-size:0.75rem; color:var(--crm-text-muted);">${escapeHTML(v.notes || 'Check-in')}</span></td>
            <td>
              <button class="table-action-btn btn-delete btn-icon-only" onclick="handleDeleteVisit('${v.id}')" title="Șterge vizită">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  }

  // Pre-fill Edit Plan Form
  const editPlanSelect = document.getElementById('editClientPlanSelect');
  const editStatusSelect = document.getElementById('editClientStatusSelect');
  const editStartDate = document.getElementById('editClientStartDate');
  const editEndDate = document.getElementById('editClientEndDate');
  const editVisitsLeft = document.getElementById('editClientVisitsLeft');
  const editTotalAllowed = document.getElementById('editClientTotalAllowed');

  if (editPlanSelect) editPlanSelect.value = client.plan;
  if (editStatusSelect) editStatusSelect.value = client.status;
  if (editStartDate) editStartDate.value = client.startDate;
  if (editEndDate) editEndDate.value = client.expiresDate;
  if (editVisitsLeft) editVisitsLeft.value = client.visits_left !== undefined && client.visits_left !== null ? client.visits_left : (client.total_visits_allowed || 8);
  if (editTotalAllowed) editTotalAllowed.value = client.total_visits_allowed || 8;

  // Pre-fill manual visit date input to today
  const manualDateInput = document.getElementById('manualVisitDate');
  if (manualDateInput && !manualDateInput.value) {
    manualDateInput.value = new Date().toISOString().slice(0, 10);
  }

  // Render Calendar if that tab is active
  renderClientHistoryCalendar();
}

window.showHistoryTab = function(tabId) {
  const tabs = ['tabVisitsList', 'tabAddManualVisit', 'tabEditPlan', 'tabVisitsCalendar'];
  tabs.forEach(t => {
    const el = document.getElementById(t);
    if (el) el.style.display = t === tabId ? 'block' : 'none';
  });

  const buttons = document.querySelectorAll('.history-tab-btn');
  buttons.forEach(b => {
    if (b.getAttribute('onclick')?.includes(tabId)) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });

  if (tabId === 'tabVisitsCalendar') {
    renderClientHistoryCalendar();
  }
};

function renderClientHistoryCalendar() {
  if (!currentActiveHistoryClientId) return;
  const client = getClients().find(c => c.id === currentActiveHistoryClientId);
  if (!client) return;

  const year = currentHistoryCalendarDate.getFullYear();
  const month = currentHistoryCalendarDate.getMonth();

  const monthNamesRO = [
    'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
    'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie'
  ];

  const titleEl = document.getElementById('historyCalendarMonthTitle');
  if (titleEl) titleEl.textContent = `${monthNamesRO[month]} ${year}`;

  const gridEl = document.getElementById('historyCalendarGrid');
  if (!gridEl) return;

  const visitsByDate = {};
  (client.visits || []).forEach(v => {
    if (!visitsByDate[v.date]) visitsByDate[v.date] = [];
    visitsByDate[v.date].push(v);
  });

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();

  let startingDay = firstDayOfMonth.getDay() - 1;
  if (startingDay === -1) startingDay = 6;

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const totalSlots = Math.ceil((startingDay + daysInMonth) / 7) * 7;

  const now = new Date();
  const todayFormatted = formatDateRO(now);

  let html = '';

  for (let i = 0; i < totalSlots; i++) {
    let dayNum = 0;
    let isCurrentMonth = true;
    let cellDateStr = '';

    if (i < startingDay) {
      dayNum = prevMonthLastDay - (startingDay - 1 - i);
      isCurrentMonth = false;
      const prevM = month === 0 ? 12 : month;
      const prevY = month === 0 ? year - 1 : year;
      cellDateStr = `${String(dayNum).padStart(2, '0')}.${String(prevM).padStart(2, '0')}.${prevY}`;
    } else if (i >= startingDay + daysInMonth) {
      dayNum = i - (startingDay + daysInMonth) + 1;
      isCurrentMonth = false;
      const nextM = month === 11 ? 1 : month + 2;
      const nextY = month === 11 ? year + 1 : year;
      cellDateStr = `${String(dayNum).padStart(2, '0')}.${String(nextM).padStart(2, '0')}.${nextY}`;
    } else {
      dayNum = i - startingDay + 1;
      cellDateStr = `${String(dayNum).padStart(2, '0')}.${String(month + 1).padStart(2, '0')}.${year}`;
    }

    const dayVisits = visitsByDate[cellDateStr] || [];
    const hasVisited = dayVisits.length > 0;
    const isToday = cellDateStr === todayFormatted;

    let cellClasses = 'calendar-day-cell';
    if (!isCurrentMonth) cellClasses += ' other-month';
    if (isToday) cellClasses += ' today';
    if (hasVisited) cellClasses += ' present';

    let badgeHTML = '';
    if (hasVisited) {
      const times = dayVisits.map(v => v.time || '12:00').join(', ');
      badgeHTML = `
        <div class="calendar-day-badge" title="Vizită: ${times}">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          ${times}
        </div>
      `;
    }

    html += `
      <div class="${cellClasses}" onclick="showCalendarDayVisitDetails('${cellDateStr}', '${client.id}')">
        <div class="calendar-day-num">${dayNum}</div>
        ${badgeHTML}
      </div>
    `;
  }

  gridEl.innerHTML = html;

  const detailsBox = document.getElementById('historyCalendarDayDetails');
  if (detailsBox) detailsBox.style.display = 'none';
}

window.prevHistoryCalendarMonth = function() {
  currentHistoryCalendarDate.setMonth(currentHistoryCalendarDate.getMonth() - 1);
  renderClientHistoryCalendar();
};

window.nextHistoryCalendarMonth = function() {
  currentHistoryCalendarDate.setMonth(currentHistoryCalendarDate.getMonth() + 1);
  renderClientHistoryCalendar();
};

window.showCalendarDayVisitDetails = function(dateStr, clientId) {
  const client = getClients().find(c => c.id === clientId);
  if (!client) return;

  const dayVisits = (client.visits || []).filter(v => v.date === dateStr);
  const detailsBox = document.getElementById('historyCalendarDayDetails');
  if (!detailsBox) return;

  if (dayVisits.length === 0) {
    detailsBox.style.display = 'flex';
    detailsBox.innerHTML = `
      <div style="font-size:0.84rem; color:var(--crm-text-muted);">
        📅 <strong>${dateStr}</strong> — Nicio vizită înregistrată în această zi (zi de odihnă).
      </div>
      <button type="button" class="crm-btn crm-btn-secondary crm-btn-sm" onclick="this.parentElement.style.display='none'">✕</button>
    `;
  } else {
    detailsBox.style.display = 'flex';
    detailsBox.innerHTML = `
      <div>
        <div style="font-size:0.88rem; font-weight:800; color:var(--crm-green); display:flex; align-items:center; gap:0.4rem;">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          Antrenament Confirmat: ${dateStr} (${dayVisits.length} ${dayVisits.length === 1 ? 'intrare' : 'intrări'})
        </div>
        <div style="font-size:0.78rem; color:var(--crm-text-muted); margin-top:0.25rem;">
          ${dayVisits.map(v => `• Ora ${v.time || '12:00'} — <em>${escapeHTML(v.notes || 'Check-in')}</em> (${escapeHTML(v.plan || client.plan)})`).join('<br>')}
        </div>
      </div>
      <button type="button" class="crm-btn crm-btn-secondary crm-btn-sm" onclick="this.parentElement.style.display='none'">✕</button>
    `;
  }
  try {
    detailsBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch {}
};

window.handleManualVisitSubmit = async function(e) {
  e.preventDefault();
  if (!currentActiveHistoryClientId) return;

  const rawDate = document.getElementById('manualVisitDate')?.value;
  const time = document.getElementById('manualVisitTime')?.value || '12:00';
  const note = document.getElementById('manualVisitNote')?.value || 'Vizită adăugată manual';

  if (!rawDate) {
    alert('Selectează data vizitei!');
    return;
  }

  const dateParts = rawDate.split('-');
  const formattedDate = `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}`;
  const timestamp = new Date(`${rawDate}T${time}:00`).toISOString();

  const clients = getClients();
  const client = clients.find(c => c.id === currentActiveHistoryClientId);
  if (!client) return;

  if (!Array.isArray(client.visits)) client.visits = [];

  const visitItem = {
    id: 'VIS-' + Date.now().toString(36).toUpperCase(),
    timestamp: timestamp,
    date: formattedDate,
    time: time,
    plan: client.plan,
    notes: note
  };

  client.visits.unshift(visitItem);
  recalculateClientVisitsLeft(client);

  saveClients(clients);
  renderAllViews();
  renderClientHistoryModal();
  showHistoryTab('tabVisitsList');

  if (window.dbClient?.insertVisit) {
    window.dbClient.insertVisit({
      id: visitItem.id,
      client_id: client.id,
      visit_date: visitItem.date,
      visit_time: visitItem.time,
      timestamp: visitItem.timestamp,
      plan: visitItem.plan,
      notes: visitItem.notes
    });
  }

  if (window.dbClient?.updateClient) {
    window.dbClient.updateClient(client.id, {
      visits_left: client.visits_left,
      status: client.status
    });
  }
};

window.handleDeleteVisit = async function(visitId) {
  if (!currentActiveHistoryClientId) return;
  if (!confirm('Sigur doriți să ștergeți această vizită din istoric?')) return;

  const clients = getClients();
  const client = clients.find(c => c.id === currentActiveHistoryClientId);
  if (!client) return;

  client.visits = (client.visits || []).filter(v => v.id !== visitId);
  recalculateClientVisitsLeft(client);

  saveClients(clients);
  renderAllViews();
  renderClientHistoryModal();

  if (window.dbClient?.deleteVisit) {
    window.dbClient.deleteVisit(visitId);
  }

  if (window.dbClient?.updateClient) {
    window.dbClient.updateClient(client.id, {
      visits_left: client.visits_left,
      status: client.status
    });
  }
};

window.handleEditClientPlanSubmit = async function(e) {
  e.preventDefault();
  if (!currentActiveHistoryClientId) return;

  const plan = document.getElementById('editClientPlanSelect')?.value;
  const status = document.getElementById('editClientStatusSelect')?.value;
  const startDate = document.getElementById('editClientStartDate')?.value;
  const endDate = document.getElementById('editClientEndDate')?.value;
  const visitsLeft = parseInt(document.getElementById('editClientVisitsLeft')?.value, 10);
  const totalAllowed = parseInt(document.getElementById('editClientTotalAllowed')?.value, 10);

  const clients = getClients();
  const client = clients.find(c => c.id === currentActiveHistoryClientId);
  if (!client) return;

  client.plan = plan;
  client.status = status;
  client.startDate = startDate;
  client.expiresDate = endDate;
  if (!isNaN(totalAllowed)) client.total_visits_allowed = totalAllowed;
  if (!isNaN(visitsLeft)) {
    client.visits_left = visitsLeft;
  } else {
    recalculateClientVisitsLeft(client);
  }

  saveClients(clients);
  renderAllViews();
  renderClientHistoryModal();
  showHistoryTab('tabVisitsList');
  alert('Datele abonamentului au fost actualizate cu succes!');

  if (window.dbClient?.updateClient) {
    window.dbClient.updateClient(client.id, {
      plan: client.plan,
      status: client.status,
      start_date: client.startDate,
      end_date: client.expiresDate,
      visits_left: client.visits_left,
      total_visits_allowed: client.total_visits_allowed
    });
  }
};

// =============================================================================
// ADD CLIENT MODAL: NEW CLIENT vs EXISTING CLIENT WITH HISTORY
// =============================================================================

window.setClientModalMode = function(mode) {
  const modeInput = document.getElementById('clientRegistrationMode');
  const btnNew = document.getElementById('btnModeNewClient');
  const btnExisting = document.getElementById('btnModeExistingClient');
  const historySec = document.getElementById('existingClientHistorySection');
  const title = document.getElementById('addClientModalTitle');

  if (modeInput) modeInput.value = mode;

  if (mode === 'history') {
    if (btnNew) btnNew.classList.remove('active');
    if (btnExisting) {
      btnExisting.classList.add('active');
      btnExisting.classList.add('mode-history');
    }
    if (historySec) historySec.style.display = 'block';
    if (title) title.textContent = 'Înregistrează Client Existent (Cu Istoric)';

    const startInput = document.getElementById('newClientStartDateCustom');
    if (startInput && !startInput.value) {
      startInput.value = new Date().toISOString().slice(0, 10);
    }

    updateAutoExpiryDate();
    updateVisitsBalanceInputs();
  } else {
    if (btnExisting) {
      btnExisting.classList.remove('active');
      btnExisting.classList.remove('mode-history');
    }
    if (btnNew) btnNew.classList.add('active');
    if (historySec) historySec.style.display = 'none';
    if (title) title.textContent = 'Înregistrează Client / Abonament Nou';
  }
};

window.openAddExistingClientModal = function() {
  openModal('addClientModal');
  setClientModalMode('history');
};

window.addPastDateTagFromInput = function() {
  const dateInput = document.getElementById('newClientSinglePastDate');
  if (!dateInput || !dateInput.value) return;

  const rawDate = dateInput.value;
  const parts = rawDate.split('-');
  const dateStr = `${parts[2]}.${parts[1]}.${parts[0]}`;

  if (!tempPastDates.includes(dateStr)) {
    tempPastDates.push(dateStr);
    tempPastDates.sort((a, b) => parseDateToMS(a) - parseDateToMS(b));
    renderPastDateTags();
    dateInput.value = '';

    const completedInput = document.getElementById('newClientCompletedVisitsCount');
    if (completedInput) {
      completedInput.value = tempPastDates.length;
      updateVisitsBalanceInputs();
    }
  }
};

window.removePastDateTag = function(idx) {
  tempPastDates.splice(idx, 1);
  renderPastDateTags();
  const completedInput = document.getElementById('newClientCompletedVisitsCount');
  if (completedInput) {
    completedInput.value = tempPastDates.length;
    updateVisitsBalanceInputs();
  }
};

function renderPastDateTags() {
  const container = document.getElementById('pastDatesTagsContainer');
  if (!container) return;

  if (tempPastDates.length === 0) {
    container.innerHTML = `<span style="font-size:0.75rem; color:var(--crm-text-muted);">Nicio dată adăugată încă. Selectează data și apasă „+ Adaugă Dată” sau folosește Auto-Generează.</span>`;
    return;
  }

  container.innerHTML = tempPastDates.map((d, idx) => `
    <span class="past-date-tag">
      ${escapeHTML(d)}
      <span class="past-date-tag-remove" onclick="removePastDateTag(${idx})">✕</span>
    </span>
  `).join('');
}

window.autoGenerateRecentVisitDates = function() {
  const plan = document.getElementById('newClientPlan')?.value || '';
  const isLimited = plan.includes('Vizit');

  let count = 12;
  if (isLimited) {
    const completedInput = document.getElementById('newClientCompletedVisitsCount');
    count = parseInt(completedInput?.value, 10);
    if (isNaN(count) || count <= 0) count = plan.includes('8') ? 5 : 8;
  } else {
    const unlimitedCountInput = document.getElementById('newClientUnlimitedVisitsCount');
    count = parseInt(unlimitedCountInput?.value, 10);
    if (isNaN(count) || count <= 0) count = 15;
  }

  tempPastDates = [];
  const now = new Date();

  // Generate 3 visits per week backwards (Mon=1, Wed=3, Fri=5)
  let daysBack = 1;
  while (tempPastDates.length < count && daysBack < 365) {
    const d = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
      tempPastDates.push(formatDateRO(d));
    }
    daysBack++;
  }

  if (tempPastDates.length < count) {
    let extra = 1;
    while (tempPastDates.length < count && extra < 365) {
      const d = new Date(now.getTime() - extra * 24 * 60 * 60 * 1000);
      const str = formatDateRO(d);
      if (!tempPastDates.includes(str)) {
        tempPastDates.push(str);
      }
      extra++;
    }
  }

  tempPastDates.sort((a, b) => parseDateToMS(a) - parseDateToMS(b));
  renderPastDateTags();

  if (isLimited) {
    const completedInput = document.getElementById('newClientCompletedVisitsCount');
    if (completedInput) completedInput.value = tempPastDates.length;
    updateVisitsBalanceInputs();
  }
};

// =============================================================================
// FORM LISTENERS & SEARCH FILTERS
// =============================================================================

function initEventListeners() {
  const addExpenseBtn = document.getElementById('openAddExpenseBtn');
  if (addExpenseBtn) {
    addExpenseBtn.addEventListener('click', () => openModal('addExpenseModal'));
  }

  const addClientBtn = document.getElementById('openAddClientBtn');
  if (addClientBtn) {
    addClientBtn.addEventListener('click', () => {
      setClientModalMode('new');
      openModal('addClientModal');
    });
  }

  const expenseForm = document.getElementById('newExpenseForm');
  if (expenseForm) {
    expenseForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const desc = document.getElementById('newExpenseDesc')?.value || 'Cheltuială';
      let cat = document.getElementById('newExpenseCategory')?.value || 'Altele / Neprevăzute';

      if (cat === '__NEW_CATEGORY__') {
        const customCatInput = document.getElementById('newExpenseCustomCategory');
        const customCatVal = customCatInput?.value.trim();
        if (customCatVal) {
          cat = customCatVal;
          const customCats = JSON.parse(localStorage.getItem('xfitness_custom_categories') || '[]');
          if (!customCats.includes(cat)) {
            customCats.push(cat);
            localStorage.setItem('xfitness_custom_categories', JSON.stringify(customCats));
            if (window.dbClient?.insertCategory) {
              window.dbClient.insertCategory(cat);
            }
            populateCategorySelects();
          }
        } else {
          cat = 'Altele / Neprevăzute';
        }
      }

      const amount = parseFloat(document.getElementById('newExpenseAmount')?.value) || 0;
      const date = document.getElementById('newExpenseDate')?.value || formatDateRO(new Date());

      const expenseItem = {
        id: 'EXP-' + Date.now().toString(36).toUpperCase(),
        description: desc,
        category: cat,
        amount: amount,
        date: date
      };

      const expenses = getExpenses();
      expenses.unshift(expenseItem);
      localStorage.setItem('xfitness_expenses', JSON.stringify(expenses));

      if (window.dbClient?.insertExpense) {
        window.dbClient.insertExpense({
          id: expenseItem.id,
          title: expenseItem.description,
          amount: expenseItem.amount,
          category: expenseItem.category,
          date: expenseItem.date
        });
      }

      expenseForm.reset();
      const customGroup = document.getElementById('customCategoryGroup');
      if (customGroup) customGroup.style.display = 'none';
      closeModal('addExpenseModal');
      renderAllViews();
    });
  }

  const clientForm = document.getElementById('newClientForm');
  if (clientForm) {
    clientForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const mode = document.getElementById('clientRegistrationMode')?.value || 'new';
      const name = document.getElementById('newClientName')?.value.trim() || 'Client';
      const phone = document.getElementById('newClientPhone')?.value.trim() || '';
      const plan = document.getElementById('newClientPlan')?.value || 'Nelimitat 1 Lună';
      const price = parseFloat(document.getElementById('newClientPrice')?.value) || 0;

      const isLimited = plan.includes('Vizit');
      let totalAllowed = null;
      let visitsLeft = null;

      if (plan.includes('8 Vizite')) { totalAllowed = 8; visitsLeft = 8; }
      else if (plan.includes('12 Vizite')) { totalAllowed = 12; visitsLeft = 12; }
      else if (plan.includes('1 Vizită')) { totalAllowed = 1; visitsLeft = 1; }

      let startDateStr = '';
      let endDateStr = '';
      const clientVisits = [];

      if (mode === 'history') {
        const rawStart = document.getElementById('newClientStartDateCustom')?.value;
        const rawEnd = document.getElementById('newClientEndDateCustom')?.value;

        if (rawStart) {
          const p = rawStart.split('-');
          startDateStr = `${p[2]}.${p[1]}.${p[0]}`;
        } else {
          startDateStr = formatDateRO(new Date());
        }

        if (rawEnd) {
          const p = rawEnd.split('-');
          endDateStr = `${p[2]}.${p[1]}.${p[0]}`;
        } else {
          const nextM = new Date();
          nextM.setMonth(nextM.getMonth() + 1);
          endDateStr = formatDateRO(nextM);
        }

        if (isLimited) {
          const completedCount = parseInt(document.getElementById('newClientCompletedVisitsCount')?.value, 10) || tempPastDates.length || 0;
          const remInput = parseInt(document.getElementById('newClientRemainingVisitsCustom')?.value, 10);
          if (!isNaN(remInput)) {
            visitsLeft = remInput;
          } else {
            visitsLeft = Math.max(0, totalAllowed - completedCount);
          }
        }

        // Generate visit entries for all past dates added
        tempPastDates.forEach((dStr, idx) => {
          const ms = parseDateToMS(dStr);
          clientVisits.push({
            id: 'VIS-PAST-' + idx + '-' + Date.now().toString(36),
            timestamp: new Date(ms).toISOString(),
            date: dStr,
            time: '12:00',
            plan: plan,
            notes: 'Vizită istoric confirmat'
          });
        });
      } else {
        const today = new Date();
        const nextMonth = new Date();
        if (plan.includes('12 Luni')) nextMonth.setFullYear(today.getFullYear() + 1);
        else if (plan.includes('6 Luni')) nextMonth.setMonth(today.getMonth() + 6);
        else if (plan.includes('3 Luni')) nextMonth.setMonth(today.getMonth() + 3);
        else nextMonth.setDate(today.getDate() + 30);

        startDateStr = formatDateRO(today);
        endDateStr = formatDateRO(nextMonth);
      }

      const clientItem = {
        id: 'CLI-' + Date.now().toString(36).toUpperCase(),
        name: name,
        phone: phone,
        plan: plan,
        price: price,
        startDate: startDateStr,
        expiresDate: endDateStr,
        status: (isLimited && visitsLeft === 0) ? 'Expirat' : 'Activ',
        visits_left: visitsLeft,
        total_visits_allowed: totalAllowed,
        is_in_gym: false,
        last_checkin: null,
        visits: clientVisits
      };

      if (isLimited) {
        recalculateClientVisitsLeft(clientItem);
      }

      const clients = getClients();
      clients.unshift(clientItem);
      saveClients(clients);

      if (window.dbClient?.insertClient) {
        window.dbClient.insertClient({
          id: clientItem.id,
          name: clientItem.name,
          phone: clientItem.phone,
          plan: clientItem.plan,
          price: clientItem.price,
          start_date: clientItem.startDate,
          end_date: clientItem.expiresDate,
          status: clientItem.status,
          visits_left: clientItem.visits_left,
          total_visits_allowed: clientItem.total_visits_allowed,
          is_in_gym: false
        });

        if (clientVisits.length > 0 && window.dbClient.insertVisit) {
          clientVisits.forEach(v => {
            window.dbClient.insertVisit({
              id: v.id,
              client_id: clientItem.id,
              visit_date: v.date,
              visit_time: v.time,
              timestamp: v.timestamp,
              plan: v.plan,
              notes: v.notes
            });
          });
        }
      }

      clientForm.reset();
      tempPastDates = [];
      renderPastDateTags();
      closeModal('addClientModal');
      renderAllViews();
    });
  }

  // Plan select dynamic prices & toggle visits row + auto expiry calculation
  const planSelect = document.getElementById('newClientPlan');
  const priceInput = document.getElementById('newClientPrice');
  const startDateInput = document.getElementById('newClientStartDateCustom');
  const completedVisitsInput = document.getElementById('newClientCompletedVisitsCount');

  if (planSelect && priceInput) {
    planSelect.addEventListener('change', () => {
      const prices = getPricingConfig();
      const p = planSelect.value;
      if (p === '1 Vizită') priceInput.value = prices.visit1;
      else if (p === '8 Vizite') priceInput.value = prices.visit8;
      else if (p === '12 Vizite') priceInput.value = prices.visit12;
      else if (p === 'Nelimitat 1 Lună') priceInput.value = prices.unlimited1;
      else if (p === 'Nelimitat 3 Luni') priceInput.value = prices.unlimited3;
      else if (p === 'Nelimitat 6 Luni') priceInput.value = prices.unlimited6;
      else if (p === 'Nelimitat 12 Luni') priceInput.value = prices.unlimited12;
      else if (p === 'Antrenament Individual') priceInput.value = prices.pt1 * 8;

      updateVisitsBalanceInputs();
      updateAutoExpiryDate();
    });
  }

  if (startDateInput) {
    startDateInput.addEventListener('change', updateAutoExpiryDate);
    startDateInput.addEventListener('input', updateAutoExpiryDate);
  }

  if (completedVisitsInput) {
    completedVisitsInput.addEventListener('input', updateVisitsBalanceInputs);
    completedVisitsInput.addEventListener('change', updateVisitsBalanceInputs);
  }

  // Planned Expense Form Submit
  const plannedExpenseForm = document.getElementById('newPlannedExpenseForm');
  if (plannedExpenseForm) {
    plannedExpenseForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const desc = document.getElementById('newPlannedExpenseDesc')?.value.trim() || 'Planificare';
      let cat = document.getElementById('newPlannedExpenseCategory')?.value || 'Altele / Neprevăzute';

      if (cat === '__NEW_CATEGORY__') {
        const customCatInput = document.getElementById('newPlannedExpenseCustomCategory');
        const customCatVal = customCatInput?.value.trim();
        if (customCatVal) {
          cat = customCatVal;
          const customCats = JSON.parse(localStorage.getItem('xfitness_custom_categories') || '[]');
          if (!customCats.includes(cat)) {
            customCats.push(cat);
            localStorage.setItem('xfitness_custom_categories', JSON.stringify(customCats));
            if (window.dbClient?.insertCategory) {
              window.dbClient.insertCategory(cat);
            }
            populateCategorySelects();
          }
        } else {
          cat = 'Altele / Neprevăzute';
        }
      }

      const amount = parseFloat(document.getElementById('newPlannedExpenseAmount')?.value) || 0;
      const targetDate = document.getElementById('newPlannedExpenseDate')?.value.trim() || formatDateRO(new Date());
      const status = document.getElementById('newPlannedExpenseStatus')?.value || 'În Așteptare';
      const notes = document.getElementById('newPlannedExpenseNotes')?.value.trim() || '';

      const plannedItem = {
        id: 'PEXP-' + Date.now().toString(36).toUpperCase(),
        description: desc,
        category: cat,
        amount: amount,
        targetDate: targetDate,
        status: status,
        notes: notes
      };

      const plannedList = getPlannedExpenses();
      plannedList.unshift(plannedItem);
      savePlannedExpenses(plannedList);

      if (window.dbClient?.insertPlannedExpense) {
        window.dbClient.insertPlannedExpense({
          id: plannedItem.id,
          title: plannedItem.description,
          amount: plannedItem.amount,
          category: plannedItem.category,
          target_date: plannedItem.targetDate,
          status: plannedItem.status,
          notes: plannedItem.notes
        });
      }

      plannedExpenseForm.reset();
      const plannedCustomGroup = document.getElementById('plannedCustomCategoryGroup');
      if (plannedCustomGroup) plannedCustomGroup.style.display = 'none';
      closeModal('addPlannedExpenseModal');
      renderPlannedExpensesTable();
      showToast('Cheltuiala de plan a fost adăugată cu succes!');
    });
  }

  // Search & Filter listeners
  const attSearch = document.getElementById('attendanceSearchInput');
  const attFilter = document.getElementById('attendanceStatusFilter');
  if (attSearch) attSearch.addEventListener('input', renderLiveAttendanceTable);
  if (attFilter) attFilter.addEventListener('change', renderLiveAttendanceTable);

  const leadSearch = document.getElementById('leadSearchInput');
  const leadFilter = document.getElementById('leadStatusFilter');
  if (leadSearch) leadSearch.addEventListener('input', renderLeadsTable);
  if (leadFilter) leadFilter.addEventListener('change', renderLeadsTable);

  const clientSearch = document.getElementById('clientSearchInput');
  const clientFilter = document.getElementById('clientStatusFilter');
  if (clientSearch) clientSearch.addEventListener('input', renderClientsTable);
  if (clientFilter) clientFilter.addEventListener('change', renderClientsTable);

  const followupSearch = document.getElementById('followupSearchInput');
  const followupFilter = document.getElementById('followupFilterSelect');
  if (followupSearch) followupSearch.addEventListener('input', renderFollowupTable);
  if (followupFilter) followupFilter.addEventListener('change', renderFollowupTable);

  const expenseSearch = document.getElementById('expenseSearchInput');
  const expenseFilter = document.getElementById('expenseCategoryFilter');
  if (expenseSearch) expenseSearch.addEventListener('input', renderExpensesTable);
  if (expenseFilter) expenseFilter.addEventListener('change', renderExpensesTable);

  const plannedSearch = document.getElementById('plannedExpenseSearchInput');
  const plannedFilter = document.getElementById('plannedExpenseStatusFilter');
  if (plannedSearch) plannedSearch.addEventListener('input', renderPlannedExpensesTable);
  if (plannedFilter) plannedFilter.addEventListener('change', renderPlannedExpensesTable);

  // Backup Export & Import
  const exportBtn = document.getElementById('exportBackupBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const backupData = {
        exportDate: new Date().toISOString(),
        version: '3.0',
        leads: getLeads(),
        clients: getClients(),
        expenses: getExpenses(),
        plannedExpenses: getPlannedExpenses(),
        customCategories: JSON.parse(localStorage.getItem('xfitness_custom_categories') || '[]'),
        messageTemplates: getMessageTemplates(),
        activeTemplateId: getActiveTemplateId()
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `xfitness_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  const importInput = document.getElementById('importBackupInput');
  if (importInput) {
    importInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (data.leads) localStorage.setItem('xfitness_leads', JSON.stringify(data.leads));
          if (data.clients) localStorage.setItem('xfitness_clients', JSON.stringify(data.clients));
          if (data.expenses) localStorage.setItem('xfitness_expenses', JSON.stringify(data.expenses));
          if (data.plannedExpenses) localStorage.setItem('xfitness_planned_expenses', JSON.stringify(data.plannedExpenses));
          if (data.customCategories) localStorage.setItem('xfitness_custom_categories', JSON.stringify(data.customCategories));
          if (data.messageTemplates) saveMessageTemplates(data.messageTemplates);
          if (data.activeTemplateId) setActiveTemplateId(data.activeTemplateId);

          populateCategorySelects();
          populateTemplateSelects();
          renderAllViews();
          showToast('Baza de date a fost restaurată cu succes din fișierul de backup!');
        } catch (err) {
          alert('Fișier de backup invalid.');
          console.error(err);
        }
      };
      reader.readAsText(file);
    });
  }

  initPricingSettings();
}

// =============================================================================
// LEADS ACTIONS
// =============================================================================

function renderLeadsTable() {
  const leads = getLeads();
  const tbody = document.getElementById('allLeadsTableBody');
  const searchInput = document.getElementById('leadSearchInput');
  const filterSelect = document.getElementById('leadStatusFilter');
  if (!tbody) return;

  const query = (searchInput?.value || '').toLowerCase().trim();
  const filter = filterSelect?.value || 'ALL';

  const filtered = leads.filter(l => {
    const matchesQuery = (l.name || '').toLowerCase().includes(query) ||
      (l.phone || '').toLowerCase().includes(query) ||
      (l.plan || '').toLowerCase().includes(query);
    const matchesFilter = filter === 'ALL' || l.status === filter;
    return matchesQuery && matchesFilter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--crm-text-muted); padding: 2rem;">Nu sunt cereri înregistrate.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => {
    return `
      <tr>
        <td>
          <strong>${escapeHTML(l.name)}</strong><br>
          <span style="font-size:0.75rem; color:var(--crm-text-muted);">${escapeHTML(l.details || '')}</span>
        </td>
        <td><a href="tel:${l.phone.replace(/\s+/g, '')}" style="color:var(--crm-text-main); font-weight:700;">${escapeHTML(l.phone)}</a></td>
        <td><span style="font-weight:700; color:var(--crm-red);">${escapeHTML(l.plan)}</span></td>
        <td><span style="font-size:0.8rem; color:var(--crm-text-muted);">${l.date}</span></td>
        <td>
          <select class="crm-form-select" style="height:32px; font-size:0.75rem; padding:0 0.5rem;" onchange="updateLeadStatus('${l.id}', this.value)">
            <option value="Nou" ${l.status === 'Nou' ? 'selected' : ''}>Nou</option>
            <option value="Contactat" ${l.status === 'Contactat' ? 'selected' : ''}>Contactat</option>
            <option value="Confirmat" ${l.status === 'Confirmat' ? 'selected' : ''}>Confirmat</option>
          </select>
        </td>
        <td>
          <div style="display:flex; gap:0.4rem;">
            <button class="table-action-btn" onclick="convertLeadToClient('${l.id}')" title="Înregistrează ca Abonat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
              Client
            </button>
            <button class="table-action-btn btn-delete btn-icon-only" onclick="deleteLead('${l.id}')" title="Șterge Cerere">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.updateLeadStatus = function(leadId, newStatus) {
  const leads = getLeads();
  const lead = leads.find(l => l.id === leadId);
  if (lead) {
    lead.status = newStatus;
    localStorage.setItem('xfitness_leads', JSON.stringify(leads));
    renderAllViews();
    if (window.dbClient?.updateLeadStatus) {
      window.dbClient.updateLeadStatus(leadId, newStatus);
    }
  }
};

window.deleteLead = function(leadId) {
  let leads = getLeads();
  leads = leads.filter(l => l.id !== leadId);
  localStorage.setItem('xfitness_leads', JSON.stringify(leads));
  renderAllViews();
  if (window.dbClient?.deleteLead) {
    window.dbClient.deleteLead(leadId);
  }
};

window.convertLeadToClient = function(leadId) {
  const leads = getLeads();
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;

  const nameInput = document.getElementById('newClientName');
  const phoneInput = document.getElementById('newClientPhone');
  const planSelect = document.getElementById('newClientPlan');

  if (nameInput) nameInput.value = lead.name;
  if (phoneInput) phoneInput.value = lead.phone;
  if (planSelect) {
    if (lead.plan.includes('12 Luni')) planSelect.value = 'Nelimitat 12 Luni';
    else if (lead.plan.includes('6 Luni')) planSelect.value = 'Nelimitat 6 Luni';
    else if (lead.plan.includes('3 Luni')) planSelect.value = 'Nelimitat 3 Luni';
    else if (lead.plan.includes('12 Vizite')) planSelect.value = '12 Vizite';
    else if (lead.plan.includes('8 Vizite')) planSelect.value = '8 Vizite';
    else planSelect.value = 'Nelimitat 1 Lună';
  }

  lead.status = 'Confirmat';
  localStorage.setItem('xfitness_leads', JSON.stringify(leads));
  if (window.dbClient?.updateLeadStatus) {
    window.dbClient.updateLeadStatus(leadId, 'Confirmat');
  }

  setClientModalMode('new');
  openModal('addClientModal');
};

window.deleteClient = function(clientId) {
  if (!confirm('Sigur doriți să ștergeți acest client din sistem? Toate datele și istoricul vor fi eliminate.')) return;
  let clients = getClients();
  clients = clients.filter(c => c.id !== clientId);
  saveClients(clients);
  renderAllViews();
  if (window.dbClient?.deleteClient) {
    window.dbClient.deleteClient(clientId);
  }
};

// =============================================================================
// EXPENSES
// =============================================================================

function renderExpensesTable() {
  const expenses = getExpenses();
  const tbody = document.getElementById('allExpensesTableBody');
  const searchInput = document.getElementById('expenseSearchInput');
  const filterSelect = document.getElementById('expenseCategoryFilter');
  if (!tbody) return;

  const query = (searchInput?.value || '').toLowerCase().trim();
  const filter = filterSelect?.value || 'ALL';

  const filtered = expenses.filter(e => {
    const desc = e.description || '';
    const cat = e.category || '';
    const matchesQuery = desc.toLowerCase().includes(query) || cat.toLowerCase().includes(query);
    const matchesFilter = filter === 'ALL' || cat === filter;
    return matchesQuery && matchesFilter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--crm-text-muted); padding: 2rem;">Nicio cheltuială înregistrată. Apasă butonul „Adaugă Cheltuială Nouă”.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(e => {
    return `
      <tr>
        <td><strong>${escapeHTML(e.description)}</strong></td>
        <td><span class="status-badge" style="background:#F1F5F9; color:var(--crm-text-main); font-weight:700;">${escapeHTML(e.category)}</span></td>
        <td><strong style="color:var(--crm-red); font-size:0.95rem;">${Number(e.amount).toLocaleString('ro-RO')} Lei</strong></td>
        <td><span style="font-size:0.8rem; color:var(--crm-text-muted);">${e.date}</span></td>
        <td>
          <button class="table-action-btn btn-delete btn-icon-only" onclick="deleteExpense('${e.id}')" title="Șterge Cheltuială">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

window.deleteExpense = function(expenseId) {
  let expenses = getExpenses();
  expenses = expenses.filter(e => e.id !== expenseId);
  localStorage.setItem('xfitness_expenses', JSON.stringify(expenses));
  renderAllViews();
  if (window.dbClient?.deleteExpense) {
    window.dbClient.deleteExpense(expenseId);
  }
};

// =============================================================================
// PLANNED EXPENSES (CHELTUIELI DE PLAN & INVESTITII VIITOARE)
// =============================================================================

function renderPlannedExpensesTable() {
  const planned = getPlannedExpenses();
  const tbody = document.getElementById('plannedExpensesTableBody');
  const searchInput = document.getElementById('plannedExpenseSearchInput');
  const statusFilter = document.getElementById('plannedExpenseStatusFilter');

  const totalSum = planned.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const pendingCount = planned.filter(p => p.status === 'În Așteptare').length;
  const doneCount = planned.filter(p => p.status === 'Realizat').length;

  const elTotal = document.getElementById('plannedKpiTotal');
  const elPending = document.getElementById('plannedKpiPending');
  const elDone = document.getElementById('plannedKpiDone');

  if (elTotal) elTotal.textContent = `${totalSum.toLocaleString('ro-RO')} Lei`;
  if (elPending) elPending.textContent = `${pendingCount}`;
  if (elDone) elDone.textContent = `${doneCount}`;

  if (!tbody) return;

  const query = (searchInput?.value || '').toLowerCase().trim();
  const filter = statusFilter?.value || 'ALL';

  const filtered = planned.filter(p => {
    const desc = (p.description || '').toLowerCase();
    const cat = (p.category || '').toLowerCase();
    const matchesQuery = desc.includes(query) || cat.includes(query);
    const matchesStatus = filter === 'ALL' || p.status === filter;
    return matchesQuery && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--crm-text-muted); padding:2rem;">Nicio cheltuială planificată înregistrată. Apasă butonul „Adaugă Cheltuială de Plan” pentru a planifica investiții viitoare (ex: podea, aparate noi).</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(p => {
    const isDone = p.status === 'Realizat';
    const statusBadgeClass = isDone ? 'status-planned-done' : 'status-planned-pending';

    return `
      <tr>
        <td>
          <strong>${escapeHTML(p.description)}</strong>
          ${p.notes ? `<br><span style="font-size:0.75rem; color:var(--crm-text-muted);">${escapeHTML(p.notes)}</span>` : ''}
        </td>
        <td><span class="status-badge" style="background:#F1F5F9; color:var(--crm-text-main); font-weight:700;">${escapeHTML(p.category)}</span></td>
        <td><strong style="color:var(--crm-text-main); font-size:0.95rem;">${Number(p.amount).toLocaleString('ro-RO')} Lei</strong></td>
        <td><span style="font-size:0.82rem; font-weight:700; color:var(--crm-text-muted);">${escapeHTML(p.targetDate)}</span></td>
        <td>
          <button type="button" class="status-badge ${statusBadgeClass}" onclick="togglePlannedExpenseStatus('${p.id}')" style="cursor:pointer; border-radius:99px;" title="Apasă pentru a comuta statusul">
            ${isDone ? '✓ Realizat' : '⏳ În Așteptare'}
          </button>
        </td>
        <td>
          <div style="display:flex; gap:0.4rem;">
            <button class="table-action-btn btn-icon-only" onclick="togglePlannedExpenseStatus('${p.id}')" title="${isDone ? 'Marchează ca În Așteptare' : 'Marchează ca Realizat'}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
            <button class="table-action-btn btn-delete btn-icon-only" onclick="deletePlannedExpense('${p.id}')" title="Șterge Cheltuială Planificată">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.togglePlannedExpenseStatus = async function(id) {
  const planned = getPlannedExpenses();
  const item = planned.find(p => p.id === id);
  if (!item) return;

  item.status = item.status === 'Realizat' ? 'În Așteptare' : 'Realizat';
  savePlannedExpenses(planned);
  renderPlannedExpensesTable();
  showToast(`Status cheltuială planificată: ${item.status}`);

  if (window.dbClient?.updatePlannedExpense) {
    window.dbClient.updatePlannedExpense(id, { status: item.status });
  }
};

window.deletePlannedExpense = async function(id) {
  if (!confirm('Sigur doriți să ștergeți această cheltuială planificată?')) return;
  let planned = getPlannedExpenses();
  planned = planned.filter(p => p.id !== id);
  savePlannedExpenses(planned);
  renderPlannedExpensesTable();
  showToast('Cheltuiala planificată a fost ștearsă.');

  if (window.dbClient?.deletePlannedExpense) {
    window.dbClient.deletePlannedExpense(id);
  }
};

// =============================================================================
// TOAST NOTIFICATION
// =============================================================================

function showToast(message) {
  const toast = document.getElementById('crmToast');
  const msgEl = document.getElementById('crmToastMessage');
  if (!toast) return;
  if (msgEl) msgEl.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.__crmToastTimeout);
  window.__crmToastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

// =============================================================================
// FOLLOW-UP, MESSAGE TEMPLATES & NOTIFICĂRI VIBER
// =============================================================================

const DEFAULT_MESSAGE_TEMPLATES = [
  {
    id: 'TPL-1',
    name: 'Schița 1: Expirare & Vizite (Standard)',
    text: `Bună ziua!\n\nȚinem să vă reamintim că abonamentul dvs se finiseaza pe data de {DATA_EXPIRARE}\nMai aveti {VIZITE_RAMASE} vizite de executat .\n\nVă rugăm să le indepliniți până la data expirarii :)\n\nMulțumim că sunteți cu noi .\nCu multă stimă si respect echipa Xfitnessclub🍀`
  },
  {
    id: 'TPL-2',
    name: 'Schița 2: Reminder Prietenos / Nelimitat',
    text: `Salutare {NUME}!\n\nAbonamentul tău la X-Fitness Club ({PLAN}) este valabil până pe data de {DATA_EXPIRARE}.\nTe așteptăm cu multă energie la antrenamente! 💪\n\nCu drag,\nEchipa X-Fitness Club 🍀`
  },
  {
    id: 'TPL-3',
    name: 'Schița 3: Abonament Expirat / Reînnoire',
    text: `Bună ziua {NUME}!\n\nAbonamentul dvs ({PLAN}) a expirat. Vă așteptăm cu drag la recepție pentru reînnoire și continuarea antrenamentelor la X-Fitness Club! 🏋️‍♂️\n\nCu multă stimă,\nEchipa Xfitnessclub🍀`
  }
];

function getMessageTemplates() {
  try {
    const saved = JSON.parse(localStorage.getItem('xfitness_message_templates'));
    if (saved && Array.isArray(saved) && saved.length > 0) return saved;
  } catch {}
  return DEFAULT_MESSAGE_TEMPLATES;
}

function saveMessageTemplates(templates) {
  localStorage.setItem('xfitness_message_templates', JSON.stringify(templates));
}

function getActiveTemplateId() {
  return localStorage.getItem('xfitness_active_template_id') || 'TPL-1';
}

function setActiveTemplateId(id) {
  localStorage.setItem('xfitness_active_template_id', id);
}

function populateTemplateSelects() {
  const templates = getMessageTemplates();
  const activeId = getActiveTemplateId();
  const selectEl = document.getElementById('followupActiveTemplateSelect');

  if (selectEl) {
    selectEl.innerHTML = templates.map(t => `
      <option value="${escapeHTML(t.id)}" ${t.id === activeId ? 'selected' : ''}>
        ${escapeHTML(t.name)}
      </option>
    `).join('');
  }
}

window.changeActiveTemplate = function(templateId) {
  setActiveTemplateId(templateId);
  renderFollowupTable();
  const templates = getMessageTemplates();
  const t = templates.find(item => item.id === templateId);
  showToast(`Schiță activă selectată: ${t ? t.name : 'Actualizat'}`);
};

window.openManageTemplatesModal = function() {
  renderTemplatesListInModal();
  const activeId = getActiveTemplateId();
  selectTemplateForEdit(activeId);
  openModal('manageTemplatesModal');
};

function renderTemplatesListInModal() {
  const templates = getMessageTemplates();
  const activeId = getActiveTemplateId();
  const editingId = document.getElementById('editingTemplateId')?.value || activeId;
  const container = document.getElementById('templatesListContainer');
  if (!container) return;

  container.innerHTML = templates.map(t => {
    const isEditing = t.id === editingId;
    const isActive = t.id === activeId;

    return `
      <div class="template-item-card ${isEditing ? 'active' : ''}" onclick="selectTemplateForEdit('${t.id}')">
        <div class="template-item-header">
          <strong style="font-size:0.88rem; color:var(--crm-text-main); line-height:1.3;">${escapeHTML(t.name)}</strong>
          ${isActive ? '<span class="status-badge status-active" style="font-size:0.68rem; padding:0.15rem 0.5rem; flex-shrink:0;">Activă</span>' : ''}
        </div>
        <div class="template-card-preview-text">
          ${escapeHTML(t.text)}
        </div>
      </div>
    `;
  }).join('');
}

window.selectTemplateForEdit = function(templateId) {
  const templates = getMessageTemplates();
  const t = templates.find(item => item.id === templateId) || templates[0];
  if (!t) return;

  const idInput = document.getElementById('editingTemplateId');
  const nameInput = document.getElementById('editingTemplateName');
  const textInput = document.getElementById('editingTemplateText');
  const delBtn = document.getElementById('btnDeleteTemplate');

  if (idInput) idInput.value = t.id;
  if (nameInput) nameInput.value = t.name;
  if (textInput) textInput.value = t.text;

  if (delBtn) {
    delBtn.style.display = templates.length > 1 ? 'inline-flex' : 'none';
  }

  renderTemplatesListInModal();
};

window.insertTagIntoTemplate = function(tag) {
  const textarea = document.getElementById('editingTemplateText');
  if (!textarea) return;
  const start = textarea.selectionStart || textarea.value.length;
  const end = textarea.selectionEnd || textarea.value.length;
  const text = textarea.value;
  textarea.value = text.substring(0, start) + tag + text.substring(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + tag.length;
};

window.addNewTemplatePrompt = function() {
  const templates = getMessageTemplates();
  const newTpl = {
    id: 'TPL-' + Date.now().toString(36).toUpperCase(),
    name: `Schiță Nouă ${templates.length + 1}`,
    text: `Bună ziua {NUME}!\n\nAbonamentul dvs la X-Fitness Club expiră pe data de {DATA_EXPIRARE}.\nVă așteptăm cu drag! 🍀`
  };
  templates.push(newTpl);
  saveMessageTemplates(templates);
  setActiveTemplateId(newTpl.id);
  populateTemplateSelects();
  selectTemplateForEdit(newTpl.id);
  renderFollowupTable();
  showToast('Schiță nouă creată!');
};

window.saveCurrentEditingTemplate = function() {
  const idInput = document.getElementById('editingTemplateId');
  const nameInput = document.getElementById('editingTemplateName');
  const textInput = document.getElementById('editingTemplateText');

  const id = idInput?.value;
  const name = nameInput?.value.trim() || 'Schiță Mesaj';
  const text = textInput?.value.trim();

  if (!text) {
    alert('Introduceți textul pentru schiță.');
    return;
  }

  let templates = getMessageTemplates();
  const idx = templates.findIndex(t => t.id === id);
  if (idx !== -1) {
    templates[idx].name = name;
    templates[idx].text = text;
  } else {
    templates.push({ id: id || 'TPL-' + Date.now().toString(36).toUpperCase(), name, text });
  }

  saveMessageTemplates(templates);
  populateTemplateSelects();
  renderTemplatesListInModal();
  renderFollowupTable();
  showToast('Schița a fost salvată cu succes!');
};

window.deleteCurrentEditingTemplate = function() {
  const idInput = document.getElementById('editingTemplateId');
  const id = idInput?.value;
  let templates = getMessageTemplates();
  if (templates.length <= 1) {
    alert('Trebuie să păstrați cel puțin o schiță de mesaj în sistem.');
    return;
  }

  if (!confirm('Sigur doriți să ștergeți această schiță?')) return;

  templates = templates.filter(t => t.id !== id);
  saveMessageTemplates(templates);
  setActiveTemplateId(templates[0].id);
  populateTemplateSelects();
  selectTemplateForEdit(templates[0].id);
  renderFollowupTable();
  showToast('Schița a fost ștearsă.');
};

function formatPhoneForViber(phone) {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9+]/g, '');
  if (clean.startsWith('0') && clean.length === 9) {
    clean = '+373' + clean.slice(1);
  } else if (!clean.startsWith('+') && clean.startsWith('373')) {
    clean = '+' + clean;
  } else if (!clean.startsWith('+') && clean.length === 8) {
    clean = '+373' + clean;
  }
  return clean;
}

function generateClientReminderText(client, templateId = null) {
  if (!client) return '';
  const templates = getMessageTemplates();
  const activeId = templateId || getActiveTemplateId();
  const tpl = templates.find(t => t.id === activeId) || templates[0] || DEFAULT_MESSAGE_TEMPLATES[0];

  const isLimited = (client.plan || '').includes('Vizit');
  const visitsLeft = (client.visits_left !== undefined && client.visits_left !== null) ? client.visits_left : 0;
  const expiryStr = client.expiresDate || 'sfârșitul lunii';
  const planStr = client.plan || 'Abonament';
  const nameStr = client.name || 'Client';

  let rawText = tpl.text;
  
  if (tpl.id === 'TPL-1' && !isLimited) {
    rawText = `Bună ziua!\n\nȚinem să vă reamintim că abonamentul dvs se finiseaza pe data de {DATA_EXPIRARE} .\nVă așteptăm cu drag la antrenamente până la data expirării :)\n\nMulțumim că sunteți cu noi .\nCu multă stimă si respect echipa Xfitnessclub🍀`;
  }

  return rawText
    .replace(/\{NUME\}/g, nameStr)
    .replace(/\{DATA_EXPIRARE\}/g, expiryStr)
    .replace(/\{VIZITE_RAMASE\}/g, String(visitsLeft))
    .replace(/\{PLAN\}/g, planStr);
}

let selectedFollowupClientIds = new Set();

function getFilteredFollowupClients() {
  const clients = getClients();
  const searchInput = document.getElementById('followupSearchInput');
  const filterSelect = document.getElementById('followupFilterSelect');

  const query = (searchInput?.value || '').toLowerCase().trim();
  const filter = filterSelect?.value || 'ALL';
  const now = Date.now();
  const soonLimit = now + 7 * 24 * 60 * 60 * 1000;

  return clients.filter(c => {
    const nameMatch = (c.name || '').toLowerCase().includes(query);
    const phoneMatch = (c.phone || '').toLowerCase().includes(query);
    const planMatch = (c.plan || '').toLowerCase().includes(query);
    if (!nameMatch && !phoneMatch && !planMatch) return false;

    const isLimited = (c.plan || '').includes('Vizit');
    const expiryMs = parseDateToMS(c.expiresDate);

    if (filter === 'EXPIRING') {
      return c.status === 'Activ' && expiryMs >= now && expiryMs <= soonLimit;
    }
    if (filter === 'VISITS') {
      return isLimited;
    }
    if (filter === 'UNLIMITED') {
      return !isLimited;
    }
    if (filter === 'EXPIRED') {
      return c.status === 'Expirat' || (isLimited && c.visits_left === 0) || (expiryMs > 0 && expiryMs < now);
    }
    return true;
  });
}

function renderFollowupTable() {
  const clients = getFilteredFollowupClients();
  const tbody = document.getElementById('followupTableBody');
  const masterCb = document.getElementById('followupMasterCheckbox');

  // Update badge in sidebar
  const allClients = getClients();
  const now = Date.now();
  const soonLimit = now + 7 * 24 * 60 * 60 * 1000;
  const expiringSoonCount = allClients.filter(c => {
    const expMs = parseDateToMS(c.expiresDate);
    return c.status === 'Activ' && expMs >= now && expMs <= soonLimit;
  }).length;

  const followupBadge = document.getElementById('navFollowupBadge');
  if (followupBadge) {
    if (expiringSoonCount > 0) {
      followupBadge.textContent = expiringSoonCount;
      followupBadge.style.display = 'inline-block';
    } else {
      followupBadge.style.display = 'none';
    }
  }

  if (!tbody) return;

  if (clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--crm-text-muted); padding:2rem;">Niciun client găsit conform filtrelor de follow-up selectate.</td></tr>`;
    if (masterCb) masterCb.checked = false;
    return;
  }

  const allSelected = clients.length > 0 && clients.every(c => selectedFollowupClientIds.has(c.id));
  if (masterCb) masterCb.checked = allSelected;

  tbody.innerHTML = clients.map(c => {
    const isSelected = selectedFollowupClientIds.has(c.id);
    const isLimited = (c.plan || '').includes('Vizit');
    const visitsLeft = c.visits_left !== undefined && c.visits_left !== null ? c.visits_left : 0;
    const total = c.total_visits_allowed || (c.plan.includes('8') ? 8 : (c.plan.includes('12') ? 12 : 1));

    let balanceBadge = '';
    if (isLimited) {
      balanceBadge = `<span style="font-weight:700; color:var(--crm-text-main); font-size:0.8rem;">${visitsLeft} din ${total} rămase</span>`;
    } else {
      balanceBadge = `<span style="font-weight:700; color:var(--crm-text-main); font-size:0.8rem;">Nelimitat</span>`;
    }

    const generatedMsg = generateClientReminderText(c);
    const msgPreviewSnippet = generatedMsg.replace(/\n+/g, ' • ');
    const statusClass = c.status === 'Activ' ? 'status-active' : 'status-expired';

    return `
      <tr style="${isSelected ? 'background:#F1F5F9;' : ''}">
        <td style="text-align:center;">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleFollowupClient('${c.id}', this.checked)">
        </td>
        <td>
          <strong>${escapeHTML(c.name)}</strong><br>
          <a href="tel:${c.phone.replace(/\s+/g, '')}" style="color:var(--crm-text-muted); font-size:0.78rem; text-decoration:none;">${escapeHTML(c.phone)}</a>
        </td>
        <td>
          <span style="font-weight:700; color:var(--crm-red); font-size:0.82rem;">${escapeHTML(c.plan)}</span><br>
          ${balanceBadge}
        </td>
        <td>
          <span style="font-weight:700; font-size:0.82rem; color:var(--crm-text-main);">${c.expiresDate || '—'}</span>
        </td>
        <td>
          <span class="status-badge ${statusClass}">${c.status}</span>
        </td>
        <td>
          <div style="max-width:260px; font-size:0.75rem; color:var(--crm-text-muted); line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${escapeHTML(generatedMsg)}">
            ${escapeHTML(msgPreviewSnippet)}
          </div>
        </td>
        <td style="text-align:right;">
          <div style="display:inline-flex; gap:0.35rem; align-items:center;">
            <button type="button" class="table-action-btn btn-viber" onclick="openSendNotificationModal('${c.id}', 'viber')" title="Trimite Notificare pe Viber">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M20.4 4.6C18.6 2.8 15.8 2 12.3 2 7.7 2 3.8 3.5 2.6 7.4c-.8 2.8-.2 5.5 1.5 7.6l-.8 3.1c-.2.8.5 1.5 1.3 1.3l3.2-.8c1.4.7 3 1.1 4.5 1.1 4.6 0 8.5-1.5 9.7-5.4 1.2-3.9.3-7.8-1.6-9.7zm-2.8 9.9c-.3.9-1.5 1.6-2.5 1.6-1.1 0-2.8-.8-4.7-2.7-1.9-1.9-2.7-3.6-2.7-4.7 0-1 .7-2.2 1.6-2.5.4-.1.8 0 1 .3l1.1 1.7c.2.4.2.8 0 1.1l-.5.7c-.2.2-.2.5 0 .7.6 1 1.4 1.8 2.4 2.4.2.2.5.2.7 0l.7-.5c.3-.2.7-.2 1.1 0l1.7 1.1c.3.3.4.7.2 1.1z"/></svg>
              Viber
            </button>
            <button type="button" class="table-action-btn btn-icon-only" onclick="copyClientNotificationText('${c.id}')" title="Copiază Mesajul">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.selectFollowupGroup = function(groupType) {
  const clients = getClients();
  const now = Date.now();
  const soonLimit = now + 7 * 24 * 60 * 60 * 1000;

  selectedFollowupClientIds.clear();

  clients.forEach(c => {
    const isLimited = (c.plan || '').includes('Vizit');
    const expiryMs = parseDateToMS(c.expiresDate);

    if (groupType === 'VISITS') {
      if (isLimited && c.status === 'Activ') selectedFollowupClientIds.add(c.id);
    } else if (groupType === 'UNLIMITED') {
      if (!isLimited && c.status === 'Activ') selectedFollowupClientIds.add(c.id);
    } else if (groupType === 'EXPIRING') {
      if (c.status === 'Activ' && expiryMs >= now && expiryMs <= soonLimit) selectedFollowupClientIds.add(c.id);
    } else if (groupType === 'ALL_ACTIVE') {
      if (c.status === 'Activ') selectedFollowupClientIds.add(c.id);
    }
  });

  renderFollowupTable();
  updateFollowupBatchBar();
  showToast(`Au fost selectați ${selectedFollowupClientIds.size} clienți`);
};

window.deselectAllFollowup = function() {
  selectedFollowupClientIds.clear();
  renderFollowupTable();
  updateFollowupBatchBar();
};

window.toggleFollowupSelectAll = function(isChecked) {
  const clients = getFilteredFollowupClients();
  if (isChecked) {
    clients.forEach(c => selectedFollowupClientIds.add(c.id));
  } else {
    clients.forEach(c => selectedFollowupClientIds.delete(c.id));
  }
  renderFollowupTable();
  updateFollowupBatchBar();
};

window.toggleFollowupClient = function(clientId, isChecked) {
  if (isChecked) {
    selectedFollowupClientIds.add(clientId);
  } else {
    selectedFollowupClientIds.delete(clientId);
  }
  renderFollowupTable();
  updateFollowupBatchBar();
};

function updateFollowupBatchBar() {
  const count = selectedFollowupClientIds.size;
  const bar = document.getElementById('followupBatchBar');
  const countBadge = document.getElementById('followupSelectedCountBadge');
  if (countBadge) countBadge.textContent = count;
  if (bar) {
    if (count > 0) {
      bar.classList.add('active');
    } else {
      bar.classList.remove('active');
    }
  }
}

// Single Client Notification Modal
let currentNotificationClientId = null;

window.openSendNotificationModal = function(clientId, defaultChannel = null) {
  currentNotificationClientId = clientId;
  const client = getClients().find(c => c.id === clientId);
  if (!client) return;

  const elName = document.getElementById('notifModalClientName');
  const elPhone = document.getElementById('notifModalClientPhone');
  const elPlan = document.getElementById('notifModalClientPlanInfo');
  const elMsg = document.getElementById('notifModalMessageText');

  const isLimited = (client.plan || '').includes('Vizit');
  const visitsLeft = client.visits_left !== undefined && client.visits_left !== null ? client.visits_left : 0;
  const total = client.total_visits_allowed || (client.plan.includes('8') ? 8 : (client.plan.includes('12') ? 12 : 1));

  if (elName) elName.textContent = client.name;
  if (elPhone) elPhone.textContent = client.phone;
  if (elPlan) {
    elPlan.textContent = isLimited
      ? `Abonament: ${client.plan} (${visitsLeft}/${total} rămase) • Expirare: ${client.expiresDate || '—'}`
      : `Abonament: ${client.plan} (Nelimitat) • Expirare: ${client.expiresDate || '—'}`;
  }

  if (elMsg) {
    elMsg.value = generateClientReminderText(client);
  }

  openModal('sendClientNotificationModal');
};

window.copyNotifModalText = function() {
  const elMsg = document.getElementById('notifModalMessageText');
  if (!elMsg) return;
  navigator.clipboard.writeText(elMsg.value).then(() => {
    showToast('Mesajul a fost copiat în clipboard!');
  }).catch(() => {
    showToast('Mesaj copiat!');
  });
};

window.sendNotifViaViber = function() {
  const client = getClients().find(c => c.id === currentNotificationClientId);
  const elMsg = document.getElementById('notifModalMessageText');
  const text = elMsg ? elMsg.value : (client ? generateClientReminderText(client) : '');
  const phone = client ? formatPhoneForViber(client.phone) : '';

  try {
    navigator.clipboard.writeText(text);
  } catch (e) {}

  showToast('Deschidere Viber... Textul a fost copiat în clipboard!');
  const cleanDigits = phone.replace(/[^0-9]/g, '');
  const viberUrl = `viber://chat?number=%2B${cleanDigits}`;
  window.location.href = viberUrl;
};

window.copyClientNotificationText = function(clientId) {
  const client = getClients().find(c => c.id === clientId);
  if (!client) return;
  const text = generateClientReminderText(client);
  navigator.clipboard.writeText(text).then(() => {
    showToast(`Mesajul pentru ${client.name} a fost copiat!`);
  }).catch(() => {
    showToast(`Mesaj copiat!`);
  });
};

// Double Confirmation Modal for Bulk Sending
window.openBulkSendConfirmModal = function() {
  if (selectedFollowupClientIds.size === 0) {
    alert('Selectați cel puțin un client pentru trimiterea notificărilor.');
    return;
  }

  const clients = getClients().filter(c => selectedFollowupClientIds.has(c.id));
  const elCountText = document.getElementById('bulkConfirmCountText');
  const elCountBadge = document.getElementById('bulkConfirmCountBadge');
  const elList = document.getElementById('bulkConfirmListContainer');

  if (elCountText) elCountText.textContent = `${clients.length} clienți`;
  if (elCountBadge) elCountBadge.textContent = `${clients.length}`;

  if (elList) {
    elList.innerHTML = clients.map((c, idx) => `
      <div class="double-confirm-item">
        <div>
          <strong>${idx + 1}. ${escapeHTML(c.name)}</strong> • <span style="color:var(--crm-text-muted);">${escapeHTML(c.phone)}</span>
          <div style="font-size:0.75rem; color:var(--crm-red); font-weight:700;">${escapeHTML(c.plan)} (Exp: ${c.expiresDate || '—'})</div>
        </div>
        <div style="display:flex; gap:0.35rem;">
          <button type="button" class="table-action-btn btn-viber btn-icon-only" onclick="openSendNotificationModal('${c.id}', 'viber')" title="Trimite Viber">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M20.4 4.6C18.6 2.8 15.8 2 12.3 2 7.7 2 3.8 3.5 2.6 7.4c-.8 2.8-.2 5.5 1.5 7.6l-.8 3.1c-.2.8.5 1.5 1.3 1.3l3.2-.8c1.4.7 3 1.1 4.5 1.1 4.6 0 8.5-1.5 9.7-5.4 1.2-3.9.3-7.8-1.6-9.7zm-2.8 9.9c-.3.9-1.5 1.6-2.5 1.6-1.1 0-2.8-.8-4.7-2.7-1.9-1.9-2.7-3.6-2.7-4.7 0-1 .7-2.2 1.6-2.5.4-.1.8 0 1 .3l1.1 1.7c.2.4.2.8 0 1.1l-.5.7c-.2.2-.2.5 0 .7.6 1 1.4 1.8 2.4 2.4.2.2.5.2.7 0l.7-.5c.3-.2.7-.2 1.1 0l1.7 1.1c.3.3.4.7.2 1.1z"/></svg>
          </button>
          <button type="button" class="table-action-btn btn-icon-only" onclick="copyClientNotificationText('${c.id}')" title="Copiază Mesajul">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  openModal('bulkSendConfirmModal');
};

window.copyAllBulkMessages = function() {
  const clients = getClients().filter(c => selectedFollowupClientIds.has(c.id));
  if (clients.length === 0) return;

  const fullText = clients.map((c, idx) => {
    return `=== CLIENT ${idx + 1}: ${c.name} (${c.phone}) ===\n${generateClientReminderText(c)}\n`;
  }).join('\n----------------------------------------\n\n');

  navigator.clipboard.writeText(fullText).then(() => {
    showToast(`Toate cele ${clients.length} mesaje au fost copiate în clipboard!`);
  }).catch(() => {
    showToast(`Mesaje copiate!`);
  });
};

window.startBulkSenderQueue = function(channel = 'viber') {
  const clients = getClients().filter(c => selectedFollowupClientIds.has(c.id));
  if (clients.length === 0) return;

  closeModal('bulkSendConfirmModal');
  openSendNotificationModal(clients[0].id, 'viber');
  showToast(`Deschidere notificare Viber pentru clientul: ${clients[0].name}`);
};

// =============================================================================
// NAVIGATION & MODALS
// =============================================================================

function initNavigation() {
  const navItems = document.querySelectorAll('.crm-nav-item');
  const views = document.querySelectorAll('.crm-view');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.getAttribute('data-view');

      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      views.forEach(v => {
        if (v.id === targetView) {
          v.classList.add('active');
        } else {
          v.classList.remove('active');
        }
      });
    });
  });
}

function initModals() {
  const modals = document.querySelectorAll('.crm-modal-backdrop');
  const closeBtns = document.querySelectorAll('[data-close-crm-modal]');

  closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modals.forEach(m => m.classList.remove('active'));
    });
  });

  modals.forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('active');
    });
  });
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

// =============================================================================
// PRICING SETTINGS
// =============================================================================

const DEFAULT_PRICES = {
  visit1: 100,
  visit8: 400,
  visit12: 500,
  unlimited1: 600,
  unlimited3: 1450,
  unlimited6: 2500,
  unlimited12: 4800,
  pt1: 200,
  pt2: 150
};

function getPricingConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem('xfitness_pricing_config'));
    if (saved) return { ...DEFAULT_PRICES, ...saved };
  } catch {}
  return DEFAULT_PRICES;
}

function initPricingSettings() {
  const prices = getPricingConfig();

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('priceSetVisit1', prices.visit1);
  setVal('priceSetVisit8', prices.visit8);
  setVal('priceSetVisit12', prices.visit12);
  setVal('priceSetUnlimited1', prices.unlimited1);
  setVal('priceSetUnlimited3', prices.unlimited3);
  setVal('priceSetUnlimited6', prices.unlimited6);
  setVal('priceSetUnlimited12', prices.unlimited12);
  setVal('priceSetPT1', prices.pt1);
  setVal('priceSetPT2', prices.pt2);

  const form = document.getElementById('pricingSettingsForm');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const newPrices = {
        visit1: parseFloat(document.getElementById('priceSetVisit1')?.value) || 100,
        visit8: parseFloat(document.getElementById('priceSetVisit8')?.value) || 400,
        visit12: parseFloat(document.getElementById('priceSetVisit12')?.value) || 500,
        unlimited1: parseFloat(document.getElementById('priceSetUnlimited1')?.value) || 600,
        unlimited3: parseFloat(document.getElementById('priceSetUnlimited3')?.value) || 1450,
        unlimited6: parseFloat(document.getElementById('priceSetUnlimited6')?.value) || 2500,
        unlimited12: parseFloat(document.getElementById('priceSetUnlimited12')?.value) || 4800,
        pt1: parseFloat(document.getElementById('priceSetPT1')?.value) || 200,
        pt2: parseFloat(document.getElementById('priceSetPT2')?.value) || 150
      };

      localStorage.setItem('xfitness_pricing_config', JSON.stringify(newPrices));

      if (window.dbClient?.savePricing) {
        Object.entries(newPrices).forEach(([key, val]) => {
          window.dbClient.savePricing(key, val);
        });
      }

      alert('Tarifele au fost salvate cu succes! Prețurile de pe site-ul oficial și din formulare au fost actualizate.');
    });
  }
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.openModal = openModal;
window.closeModal = closeModal;
