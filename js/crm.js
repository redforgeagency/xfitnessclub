const CRM_CONFIG = {
  AUTH_USER: 'xclub',
  AUTH_PASS: 'k8M#v9Qz!2Xw$7pL',
  SESSION_KEY: 'xfitness_auth_token_2026'
};

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

function initCRMData() {
  if (!localStorage.getItem('xfitness_data_cleaned_v2')) {
    localStorage.setItem('xfitness_leads', JSON.stringify([]));
    localStorage.setItem('xfitness_clients', JSON.stringify([]));
    localStorage.setItem('xfitness_expenses', JSON.stringify([]));
    localStorage.setItem('xfitness_custom_categories', JSON.stringify([]));
    localStorage.setItem('xfitness_data_cleaned_v2', 'true');
  }
}

async function syncFromSupabase() {
  if (!window.dbClient) return;
  try {
    const [leads, clients, expenses, categories, pricing] = await Promise.all([
      window.dbClient.getLeads(),
      window.dbClient.getClients(),
      window.dbClient.getExpenses(),
      window.dbClient.getCategories(),
      window.dbClient.getPricing()
    ]);

    if (leads && Array.isArray(leads)) {
      localStorage.setItem('xfitness_leads', JSON.stringify(leads));
    }
    if (clients && Array.isArray(clients)) {
      const normalizedClients = clients.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        plan: c.plan,
        price: Number(c.price),
        startDate: c.start_date || c.startDate || '',
        expiresDate: c.end_date || c.expiresDate || '',
        status: c.status || 'Activ',
        visits_left: c.visits_left
      }));
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
    if (categories && Array.isArray(categories) && categories.length) {
      localStorage.setItem('xfitness_custom_categories', JSON.stringify(categories));
    }
    if (pricing && Object.keys(pricing).length) {
      localStorage.setItem('xfitness_pricing_config', JSON.stringify(pricing));
    }

    populateCategorySelects();
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
}

function populateCategorySelects() {
  const categories = getAllCategories();
  const selectExpense = document.getElementById('newExpenseCategory');
  const filterExpense = document.getElementById('expenseCategoryFilter');

  if (selectExpense) {
    selectExpense.innerHTML = `
      ${categories.map(c => `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`).join('')}
      <option value="__NEW_CATEGORY__" style="color:var(--crm-red); font-weight:700;">➕ Adaugă Categorie Personalizată...</option>
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
    return JSON.parse(localStorage.getItem('xfitness_clients') || '[]');
  } catch {
    return [];
  }
}

function getExpenses() {
  try {
    return JSON.parse(localStorage.getItem('xfitness_expenses') || '[]');
  } catch {
    return [];
  }
}

function calculateKPIs() {
  const clients = getClients();
  const leads = getLeads();
  const expenses = getExpenses();

  const activeClientsCount = clients.filter(c => c.status === 'Activ').length;
  const totalGrossRevenue = clients.reduce((sum, c) => sum + (Number(c.price) || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netProfit = totalGrossRevenue - totalExpenses;
  const profitMargin = totalGrossRevenue > 0 ? ((netProfit / totalGrossRevenue) * 100).toFixed(1) : 0;
  const newLeadsCount = leads.filter(l => l.status === 'Nou').length;

  return {
    totalMembers: activeClientsCount,
    activeClientsCount,
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
  renderLeadsTable();
  renderClientsTable();
  renderExpensesTable();
  renderExpenseCategoryBars();
}

function renderKPIs() {
  const kpi = calculateKPIs();

  const elProfit = document.getElementById('kpiNetProfit');
  const elRevenue = document.getElementById('kpiGrossRevenue');
  const elExpenses = document.getElementById('kpiTotalExpenses');
  const elMembers = document.getElementById('kpiTotalMembers');
  const elMargin = document.getElementById('kpiMarginBadge');

  if (elProfit) elProfit.textContent = `${kpi.netProfit.toLocaleString('ro-RO')} Lei`;
  if (elRevenue) elRevenue.textContent = `${kpi.totalGrossRevenue.toLocaleString('ro-RO')} Lei`;
  if (elExpenses) elExpenses.textContent = `${kpi.totalExpenses.toLocaleString('ro-RO')} Lei`;
  if (elMembers) elMembers.textContent = `${kpi.activeClientsCount}`;
  if (elMargin) elMargin.textContent = `${kpi.profitMargin}%`;

  const leadBadge = document.getElementById('navLeadBadge');
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

function renderLeadsTable() {
  const leads = getLeads();
  const tbody = document.getElementById('allLeadsTableBody');
  const searchInput = document.getElementById('leadSearchInput');
  const filterSelect = document.getElementById('leadStatusFilter');
  if (!tbody) return;

  const query = (searchInput?.value || '').toLowerCase();
  const filter = filterSelect?.value || 'ALL';

  const filtered = leads.filter(l => {
    const matchesQuery = l.name.toLowerCase().includes(query) || l.phone.toLowerCase().includes(query) || (l.plan || '').toLowerCase().includes(query);
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
            <option value="Nou" ${l.status === 'Nou' ? 'selected' : ''}>🔴 Nou</option>
            <option value="Contactat" ${l.status === 'Contactat' ? 'selected' : ''}>🟡 Contactat</option>
            <option value="Confirmat" ${l.status === 'Confirmat' ? 'selected' : ''}>🟢 Confirmat</option>
          </select>
        </td>
        <td>
          <div style="display:flex; gap:0.4rem;">
            <button class="table-action-btn" onclick="convertLeadToClient('${l.id}')" title="Înregistrează ca Abonat">
              ➕ Client
            </button>
            <button class="table-action-btn btn-delete" onclick="deleteLead('${l.id}')" title="Șterge Cerere">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderClientsTable() {
  const clients = getClients();
  const tbody = document.getElementById('allClientsTableBody');
  const searchInput = document.getElementById('clientSearchInput');
  const filterSelect = document.getElementById('clientStatusFilter');
  if (!tbody) return;

  const query = (searchInput?.value || '').toLowerCase();
  const filter = filterSelect?.value || 'ALL';

  const filtered = clients.filter(c => {
    const matchesQuery = c.name.toLowerCase().includes(query) || c.phone.toLowerCase().includes(query) || (c.plan || '').toLowerCase().includes(query);
    const matchesFilter = filter === 'ALL' || c.status === filter;
    return matchesQuery && matchesFilter;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: var(--crm-text-muted); padding: 2rem;">Niciun client înregistrat. Apasă butonul „Adaugă Client Nou” pentru a începe.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const statusClass = c.status === 'Activ' ? 'status-active' : 'status-expired';

    return `
      <tr>
        <td><strong>${escapeHTML(c.name)}</strong></td>
        <td><a href="tel:${c.phone.replace(/\s+/g, '')}" style="color:inherit; font-weight:600;">${escapeHTML(c.phone)}</a></td>
        <td><span style="font-weight:700;">${escapeHTML(c.plan)}</span></td>
        <td><strong style="color:var(--crm-red);">${Number(c.price).toLocaleString('ro-RO')} Lei</strong></td>
        <td><span style="font-size:0.8rem; color:var(--crm-text-muted);">${c.startDate} — ${c.expiresDate}</span></td>
        <td><span class="status-badge ${statusClass}">${c.status}</span></td>
        <td>
          <button class="table-action-btn btn-delete" onclick="deleteClient('${c.id}')" title="Șterge Client">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Șterge
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderExpensesTable() {
  const expenses = getExpenses();
  const tbody = document.getElementById('allExpensesTableBody');
  const searchInput = document.getElementById('expenseSearchInput');
  const filterSelect = document.getElementById('expenseCategoryFilter');
  if (!tbody) return;

  const query = (searchInput?.value || '').toLowerCase();
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
          <button class="table-action-btn btn-delete" onclick="deleteExpense('${e.id}')" title="Șterge Cheltuială">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            Șterge
          </button>
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

  openModal('addClientModal');
};

window.deleteClient = function(clientId) {
  let clients = getClients();
  clients = clients.filter(c => c.id !== clientId);
  localStorage.setItem('xfitness_clients', JSON.stringify(clients));
  renderAllViews();
  if (window.dbClient?.deleteClient) {
    window.dbClient.deleteClient(clientId);
  }
};

window.deleteExpense = function(expenseId) {
  let expenses = getExpenses();
  expenses = expenses.filter(e => e.id !== expenseId);
  localStorage.setItem('xfitness_expenses', JSON.stringify(expenses));
  renderAllViews();
  if (window.dbClient?.deleteExpense) {
    window.dbClient.deleteExpense(expenseId);
  }
};

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

function initEventListeners() {
  const addExpenseBtn = document.getElementById('openAddExpenseBtn');
  if (addExpenseBtn) {
    addExpenseBtn.addEventListener('click', () => openModal('addExpenseModal'));
  }

  const addClientBtn = document.getElementById('openAddClientBtn');
  if (addClientBtn) {
    addClientBtn.addEventListener('click', () => openModal('addClientModal'));
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
      const date = document.getElementById('newExpenseDate')?.value || new Date().toLocaleDateString('ro-RO');

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
      document.getElementById('customCategoryGroup').style.display = 'none';
      closeModal('addExpenseModal');
      renderAllViews();
    });
  }

  const clientForm = document.getElementById('newClientForm');
  if (clientForm) {
    clientForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('newClientName')?.value || 'Client';
      const phone = document.getElementById('newClientPhone')?.value || '';
      const plan = document.getElementById('newClientPlan')?.value || 'Nelimitat 1 Lună';
      const price = parseFloat(document.getElementById('newClientPrice')?.value) || 600;

      const today = new Date();
      const nextMonth = new Date();
      
      if (plan.includes('12 Luni')) nextMonth.setFullYear(today.getFullYear() + 1);
      else if (plan.includes('6 Luni')) nextMonth.setMonth(today.getMonth() + 6);
      else if (plan.includes('3 Luni')) nextMonth.setMonth(today.getMonth() + 3);
      else nextMonth.setDate(today.getDate() + 30);

      const clientItem = {
        id: 'CLI-' + Date.now().toString(36).toUpperCase(),
        name: name,
        phone: phone,
        plan: plan,
        price: price,
        startDate: today.toLocaleDateString('ro-RO'),
        expiresDate: nextMonth.toLocaleDateString('ro-RO'),
        status: 'Activ'
      };

      const clients = getClients();
      clients.unshift(clientItem);
      localStorage.setItem('xfitness_clients', JSON.stringify(clients));

      if (window.dbClient?.insertClient) {
        window.dbClient.insertClient({
          id: clientItem.id,
          name: clientItem.name,
          phone: clientItem.phone,
          plan: clientItem.plan,
          price: clientItem.price,
          start_date: clientItem.startDate,
          end_date: clientItem.expiresDate,
          status: clientItem.status
        });
      }

      clientForm.reset();
      closeModal('addClientModal');
      renderAllViews();
    });
  }

  const exportBtn = document.getElementById('exportBackupBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const backupData = {
        exportDate: new Date().toISOString(),
        leads: getLeads(),
        clients: getClients(),
        expenses: getExpenses(),
        customCategories: JSON.parse(localStorage.getItem('xfitness_custom_categories') || '[]')
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
          if (data.customCategories) localStorage.setItem('xfitness_custom_categories', JSON.stringify(data.customCategories));

          populateCategorySelects();
          renderAllViews();
          alert('Baza de date a fost restaurată cu succes din fișierul de backup!');
        } catch (err) {
          alert('Fișier de backup invalid.');
          console.error(err);
        }
      };
      reader.readAsText(file);
    });
  }

  initPricingSettings();

  const planSelect = document.getElementById('newClientPlan');
  const priceInput = document.getElementById('newClientPrice');
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
    });
  }

  const leadSearch = document.getElementById('leadSearchInput');
  const leadFilter = document.getElementById('leadStatusFilter');
  if (leadSearch) leadSearch.addEventListener('input', renderLeadsTable);
  if (leadFilter) leadFilter.addEventListener('change', renderLeadsTable);

  const clientSearch = document.getElementById('clientSearchInput');
  const clientFilter = document.getElementById('clientStatusFilter');
  if (clientSearch) clientSearch.addEventListener('input', renderClientsTable);
  if (clientFilter) clientFilter.addEventListener('change', renderClientsTable);

  const expenseSearch = document.getElementById('expenseSearchInput');
  const expenseFilter = document.getElementById('expenseCategoryFilter');
  if (expenseSearch) expenseSearch.addEventListener('input', renderExpensesTable);
  if (expenseFilter) expenseFilter.addEventListener('change', renderExpensesTable);
}

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

      alert('✅ Tarifele au fost salvate cu succes! Prețurile de pe site-ul oficial și din formulare au fost actualizate.');
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
