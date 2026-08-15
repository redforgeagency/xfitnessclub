const SUPABASE_CONFIG = {
  url: 'https://dciagxybjrgnxxxgcwaa.supabase.co',
  anonKey: 'sb_publishable_lt9FbJIaa3o7lzz_DcPUoA_Sh9IKIo7'
};

let db = null;

if (typeof supabase !== 'undefined' && supabase.createClient) {
  try {
    db = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
  } catch (err) {
    console.error('Supabase init error:', err);
  }
}

async function dbInsertLead(leadData) {
  if (!db) return null;
  try {
    const { data, error } = await db.from('leads').insert([leadData]).select();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase insert lead failed, using localStorage fallback:', err);
    return null;
  }
}

async function dbGetLeads() {
  if (!db) return null;
  try {
    const { data, error } = await db.from('leads').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase fetch leads failed:', err);
    return null;
  }
}

async function dbUpdateLeadStatus(id, status) {
  if (!db) return null;
  try {
    const { data, error } = await db.from('leads').update({ status }).eq('id', id).select();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase update lead status failed:', err);
    return null;
  }
}

async function dbDeleteLead(id) {
  if (!db) return null;
  try {
    const { error } = await db.from('leads').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Supabase delete lead failed:', err);
    return false;
  }
}

async function dbGetClients() {
  if (!db) return null;
  try {
    const { data, error } = await db.from('clients').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase fetch clients failed:', err);
    return null;
  }
}

async function dbInsertClient(clientData) {
  if (!db) return null;
  try {
    const { data, error } = await db.from('clients').insert([clientData]).select();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase insert client failed:', err);
    return null;
  }
}

async function dbUpdateClient(id, updates) {
  if (!db) return null;
  try {
    const { data, error } = await db.from('clients').update(updates).eq('id', id).select();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase update client failed:', err);
    return null;
  }
}

async function dbDeleteClient(id) {
  if (!db) return null;
  try {
    const { error } = await db.from('clients').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Supabase delete client failed:', err);
    return false;
  }
}

async function dbGetExpenses() {
  if (!db) return null;
  try {
    const { data, error } = await db.from('expenses').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase fetch expenses failed:', err);
    return null;
  }
}

async function dbInsertExpense(expenseData) {
  if (!db) return null;
  try {
    const { data, error } = await db.from('expenses').insert([expenseData]).select();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase insert expense failed:', err);
    return null;
  }
}

async function dbDeleteExpense(id) {
  if (!db) return null;
  try {
    const { error } = await db.from('expenses').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Supabase delete expense failed:', err);
    return false;
  }
}

async function dbGetPricing() {
  if (!db) return null;
  try {
    const { data, error } = await db.from('pricing_config').select('*');
    if (error) throw error;
    if (data && data.length) {
      const config = {};
      data.forEach(item => { config[item.key] = Number(item.price); });
      return config;
    }
    return null;
  } catch (err) {
    console.warn('Supabase fetch pricing failed:', err);
    return null;
  }
}

async function dbSavePricing(key, price) {
  if (!db) return null;
  try {
    const { data, error } = await db.from('pricing_config').upsert({ key, price: Number(price), updated_at: new Date().toISOString() }).select();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase save pricing failed:', err);
    return null;
  }
}

async function dbGetCategories() {
  if (!db) return null;
  try {
    const { data, error } = await db.from('custom_categories').select('*').order('created_at', { ascending: true });
    if (error) throw error;
    if (data) return data.map(c => c.name);
    return null;
  } catch (err) {
    console.warn('Supabase fetch categories failed:', err);
    return null;
  }
}

async function dbInsertCategory(name) {
  if (!db) return null;
  try {
    const { data, error } = await db.from('custom_categories').insert([{ name }]).select();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase insert category failed:', err);
    return null;
  }
}

async function dbDeleteCategory(name) {
  if (!db) return null;
  try {
    const { error } = await db.from('custom_categories').delete().eq('name', name);
    if (error) throw error;
    return true;
  } catch (err) {
    console.warn('Supabase delete category failed:', err);
    return false;
  }
}

window.dbClient = {
  db,
  insertLead: dbInsertLead,
  getLeads: dbGetLeads,
  updateLeadStatus: dbUpdateLeadStatus,
  deleteLead: dbDeleteLead,
  getClients: dbGetClients,
  insertClient: dbInsertClient,
  updateClient: dbUpdateClient,
  deleteClient: dbDeleteClient,
  getExpenses: dbGetExpenses,
  insertExpense: dbInsertExpense,
  deleteExpense: dbDeleteExpense,
  getPricing: dbGetPricing,
  savePricing: dbSavePricing,
  getCategories: dbGetCategories,
  insertCategory: dbInsertCategory,
  deleteCategory: dbDeleteCategory
};
