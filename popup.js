// ─── Feedback popup config ────────────────────────────────────────────────────
// Replace with your actual extension ID after publishing to Chrome Web Store
const STORE_URL = 'https://chromewebstore.google.com/detail/quick-links/enlpbohhejbabdcpeoepflldnppafjmb';
// Proxy server URL for receiving feedback (deploy server.js to Railway and paste URL here)
const PROXY_URL = 'https://xmlworker-production.up.railway.app';
// How long to wait before showing the popup (default: 3 days)
const FEEDBACK_DELAY_MS = 3 * 24 * 60 * 60 * 1000;
// ─────────────────────────────────────────────────────────────────────────────

// Localization system
const translations = {};
let currentLocale = 'en';

// Load translations
async function loadTranslations() {
  const locales = ['en', 'en_US', 'en_GB', 'ru', 'de', 'es', 'es_419', 'fr', 'zh_CN', 'zh_TW', 'ja', 'ko', 'pt_BR', 'pt_PT', 'it', 'nl', 'pl', 'tr', 'ar', 'hi', 'th', 'vi', 'id', 'am', 'bn', 'ta', 'fa', 'et', 'lt', 'fi', 'fil', 'kn', 'hu', 'hr', 'sr', 'ml', 'bg', 'ro', 'te', 'cs', 'lv', 'ca', 'el', 'uk', 'no', 'gu', 'mr', 'sv', 'he', 'sw', 'sk', 'sl', 'ms', 'da'];
  
  for (const locale of locales) {
    try {
      const response = await fetch(`_locales/${locale}/messages.json`);
      const data = await response.json();
      translations[locale] = {};
      
      // Convert Chrome i18n format to simple key-value
      for (const [key, value] of Object.entries(data)) {
        translations[locale][key] = value.message;
      }
    } catch (err) {
      console.log(`Could not load locale: ${locale}`);
    }
  }
}

// Get translation for current locale
function t(key) {
  if (translations[currentLocale] && translations[currentLocale][key]) {
    return translations[currentLocale][key];
  }
  // Fallback to English
  if (translations['en'] && translations['en'][key]) {
    return translations['en'][key];
  }
  return key;
}

// Apply translations to the page
function applyTranslations() {
  // Translate elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = t(key);
    
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.placeholder = translation;
    } else {
      element.textContent = translation;
    }
  });

  // Translate placeholders
  document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    element.placeholder = t(key);
  });

  // Translate titles
  document.querySelectorAll('[data-i18n-title]').forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    element.title = t(key);
  });
  
  // Re-render all dynamic content
  renderAll();
}

// State Management
let state = {
  templates: [],
  favorites: [],
  history: [],
  clipboard: [],
  currentFilter: ''
};

// DOM Elements
const elements = {
  tabs: document.querySelectorAll('.tab'),
  tabContents: document.querySelectorAll('.tab-content'),
  templatesList: document.getElementById('templates-list'),
  favoritesList: document.getElementById('favorites-list'),
  historyList: document.getElementById('history-list'),
  clipboardList: document.getElementById('clipboard-list'),
  addTemplateBtn: document.getElementById('add-template-btn'),
  templateName: document.getElementById('template-name'),
  templateUrl: document.getElementById('template-url'),
  templateCategory: document.getElementById('template-category'),
  categoryFilter: document.getElementById('category-filter'),
  clearHistoryBtn: document.getElementById('clear-history-btn'),
  refreshClipboardBtn: document.getElementById('refresh-clipboard-btn'),
  languageSelect: document.getElementById('language-select')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await loadTranslations();
  await loadLanguagePreference();
  applyTranslations();
  loadState();
  setupEventListeners();
  renderAll();
  startClipboardMonitoring();
  setupFeedbackListeners();
  checkAndShowFeedback();
});

// Load state from Chrome storage
function loadState() {
  chrome.storage.local.get(['templates', 'favorites', 'history', 'clipboard'], (result) => {
    state.templates = result.templates || [];
    state.favorites = result.favorites || [];
    state.history = result.history || [];
    state.clipboard = result.clipboard || [];
    renderAll();
  });
}

// Save state to Chrome storage
function saveState() {
  chrome.storage.local.set({
    templates: state.templates,
    favorites: state.favorites,
    history: state.history,
    clipboard: state.clipboard
  });
}

// Setup Event Listeners
function setupEventListeners() {
  // Tab switching
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  // Add template
  elements.addTemplateBtn.addEventListener('click', addTemplate);

  // Category filter
  elements.categoryFilter.addEventListener('change', (e) => {
    state.currentFilter = e.target.value;
    renderTemplates();
  });

  // Clear history
  elements.clearHistoryBtn.addEventListener('click', clearHistory);

  // Refresh clipboard
  elements.refreshClipboardBtn.addEventListener('click', () => {
    loadClipboardFromStorage();
    showToast(t('clipboardUpdated'));
  });

  // Language selector
  elements.languageSelect.addEventListener('change', async (e) => {
    const newLocale = e.target.value;
    currentLocale = newLocale;
    saveLanguagePreference(newLocale);
    applyTranslations();
    showToast(t('languageChanged') || 'Language changed');
  });

  // Enter key support
  [elements.templateName, elements.templateUrl, elements.templateCategory].forEach(input => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addTemplate();
      }
    });
  });
}

// Load language preference
async function loadLanguagePreference() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['preferredLocale'], (result) => {
      const preferredLocale = result.preferredLocale || 'en';
      currentLocale = preferredLocale;
      
      // Set select value
      if (elements.languageSelect) {
        elements.languageSelect.value = preferredLocale;
      }
      resolve();
    });
  });
}

// Save language preference
function saveLanguagePreference(locale) {
  currentLocale = locale;
  chrome.storage.local.set({ preferredLocale: locale });
}

// Clipboard monitoring
function startClipboardMonitoring() {
  console.log('QuickLinks: Starting clipboard monitoring in popup');

  // Listen for clipboard updates from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('QuickLinks: Popup received message:', message.type);

    if (message.type === 'clipboard-updated') {
      console.log('QuickLinks: Updating clipboard UI, items:', message.clipboard.length);
      state.clipboard = message.clipboard;
      renderClipboard();
    }
  });

  // Reliable storage-based listener (works even if popup tab was frozen)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.clipboard) {
      console.log('QuickLinks: Storage clipboard changed, updating UI');
      state.clipboard = changes.clipboard.newValue || [];
      renderClipboard();
    }
  });

  // Detect copy events directly on the popup page
  // (content.js does NOT inject into chrome-extension:// pages)
  document.addEventListener('copy', (e) => {
    try {
      let selectedText = window.getSelection().toString();

      // Fallback for input/textarea elements
      if (!selectedText || !selectedText.trim()) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
            typeof active.selectionStart === 'number') {
          selectedText = active.value.substring(active.selectionStart, active.selectionEnd);
        }
      }

      if (selectedText && selectedText.trim()) {
        chrome.runtime.sendMessage({
          type: 'clipboard-copy',
          text: selectedText.trim(),
          timestamp: new Date().toISOString()
        }).catch(() => {});
      }
    } catch (err) {
      console.log('QuickLinks: Popup copy event error:', err);
    }
  });

  // Load initial clipboard data
  loadClipboardFromStorage();
}

function loadClipboardFromStorage() {
  console.log('QuickLinks: Loading clipboard from storage');
  
  chrome.storage.local.get(['clipboard'], (result) => {
    console.log('QuickLinks: Loaded clipboard:', result.clipboard?.length || 0, 'items');
    
    if (result.clipboard) {
      state.clipboard = result.clipboard;
      renderClipboard();
    } else {
      state.clipboard = [];
      renderClipboard();
    }
  });
  
  // Also request from background script as backup
  chrome.runtime.sendMessage({ type: 'get-clipboard' }, (response) => {
    if (response && response.clipboard) {
      console.log('QuickLinks: Got clipboard from background:', response.clipboard.length, 'items');
      state.clipboard = response.clipboard;
      renderClipboard();
    }
  });
}

function addToClipboard(text) {
  // Don't add if it's the same as the last item
  if (state.clipboard.length > 0 && state.clipboard[0].text === text) {
    return;
  }

  const item = {
    id: Date.now().toString(),
    text: text,
    timestamp: new Date().toISOString()
  };

  state.clipboard.unshift(item);

  // Keep only last 15 items
  if (state.clipboard.length > 15) {
    state.clipboard = state.clipboard.slice(0, 15);
  }

  chrome.storage.local.set({ clipboard: state.clipboard });
  renderClipboard();
}

// Switch tabs
function switchTab(tabName) {
  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === tabName);
  });
  
  elements.tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
}

// Extract variables from URL template
function extractVariables(url) {
  const regex = /\{([^}]+)\}/g;
  const variables = [];
  let match;
  
  while ((match = regex.exec(url)) !== null) {
    variables.push(match[1]);
  }
  
  return variables;
}

// Parse URL into parts (text and variables)
function parseUrlParts(url) {
  const parts = [];
  let lastIndex = 0;
  const regex = /\{([^}]+)\}/g;
  let match;

  while ((match = regex.exec(url)) !== null) {
    // Add text before variable
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: url.substring(lastIndex, match.index)
      });
    }
    
    // Add variable
    parts.push({
      type: 'variable',
      name: match[1]
    });
    
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < url.length) {
    parts.push({
      type: 'text',
      content: url.substring(lastIndex)
    });
  }

  return parts;
}

// Add new template
function addTemplate() {
  const name = elements.templateName.value.trim();
  const url = elements.templateUrl.value.trim();
  const category = elements.templateCategory.value.trim();

  if (!name || !url) {
    showToast(t('fillNameAndUrl'));
    return;
  }

  const template = {
    id: Date.now().toString(),
    name,
    url,
    category: category || t('noCategory'),
    variables: extractVariables(url),
    createdAt: new Date().toISOString()
  };

  state.templates.push(template);
  saveState();
  renderAll();

  // Clear inputs
  elements.templateName.value = '';
  elements.templateUrl.value = '';
  elements.templateCategory.value = '';
  
  showToast(t('templateAdded'));
}

// Delete template
function deleteTemplate(id) {
  if (confirm(t('confirmDeleteTemplate'))) {
    state.templates = state.templates.filter(t => t.id !== id);
    saveState();
    renderAll();
    showToast(t('templateDeleted'));
  }
}

// Open URL from inline inputs
function openTemplateUrl(templateId) {
  const inputs = document.querySelectorAll(`[data-template-id="${templateId}"] .url-input`);
  const template = state.templates.find(t => t.id === templateId);
  
  if (!template) return;

  // Build URL with values
  let url = template.url;
  let allFilled = true;

  inputs.forEach(input => {
    const variable = input.dataset.variable;
    const value = input.value.trim();
    
    if (!value) {
      allFilled = false;
      input.focus();
      return;
    }
    
    url = url.replace(`{${variable}}`, value);
  });

  if (!allFilled) {
    showToast(t('fillAllFields'));
    return;
  }

  // Open URL
  chrome.tabs.create({ url }, () => {
    addToHistory(url, template.name);
  });
  
  showToast(t('linkOpened'));
}

// Add to favorites from inline inputs
function addToFavoritesFromTemplate(templateId) {
  const inputs = document.querySelectorAll(`[data-template-id="${templateId}"] .url-input`);
  const template = state.templates.find(t => t.id === templateId);
  
  if (!template) return;

  // Build URL and values object
  let url = template.url;
  const values = {};
  let allFilled = true;

  inputs.forEach(input => {
    const variable = input.dataset.variable;
    const value = input.value.trim();
    
    if (!value) {
      allFilled = false;
      input.focus();
      return;
    }
    
    values[variable] = value;
    url = url.replace(`{${variable}}`, value);
  });

  if (!allFilled) {
    showToast(t('fillAllFields'));
    return;
  }

  const favorite = {
    id: Date.now().toString(),
    name: `${template.name} (${Object.values(values).join(', ')})`,
    url: url,
    templateId: template.id,
    values,
    createdAt: new Date().toISOString()
  };

  state.favorites.push(favorite);
  saveState();
  renderFavorites();
  
  showToast(t('addedToFavorites'));
}

// Add to history
function addToHistory(url, name) {
  const historyItem = {
    id: Date.now().toString(),
    url,
    name,
    timestamp: new Date().toISOString()
  };

  state.history.unshift(historyItem);
  
  // Keep only last 50 items
  if (state.history.length > 50) {
    state.history = state.history.slice(0, 50);
  }
  
  saveState();
  renderHistory();
}

// Remove from favorites
function removeFromFavorites(id) {
  if (confirm(t('confirmRemoveFavorite'))) {
    state.favorites = state.favorites.filter(f => f.id !== id);
    saveState();
    renderFavorites();
    showToast(t('removedFromFavorites'));
  }
}

// Clear history
function clearHistory() {
  if (confirm(t('confirmClearHistory'))) {
    state.history = [];
    saveState();
    renderHistory();
    showToast(t('historyCleared'));
  }
}

// Get unique categories
function getCategories() {
  const categories = new Set();
  state.templates.forEach(t => categories.add(t.category));
  return Array.from(categories).sort();
}

// Render all
function renderAll() {
  renderTemplates();
  renderFavorites();
  renderHistory();
  renderClipboard();
  renderCategoryFilter();
}

// Render category filter
function renderCategoryFilter() {
  const categories = getCategories();
  
  elements.categoryFilter.innerHTML = `<option value="">${t('allCategories')}</option>`;
  
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category;
    if (category === state.currentFilter) {
      option.selected = true;
    }
    elements.categoryFilter.appendChild(option);
  });
}

// Render templates with inline inputs
function renderTemplates() {
  const filteredTemplates = state.currentFilter
    ? state.templates.filter(t => t.category === state.currentFilter)
    : state.templates;

  if (filteredTemplates.length === 0) {
    elements.templatesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">${t('noTemplates')}</div>
      </div>
    `;
    return;
  }

  elements.templatesList.innerHTML = filteredTemplates.map(template => {
    const parts = parseUrlParts(template.url);
    
    const urlBuilderHtml = parts.map(part => {
      if (part.type === 'text') {
        return `<span class="url-part">${escapeHtml(part.content)}</span>`;
      } else {
        return `
          <span class="url-input-wrapper">
            <input 
              type="text" 
              class="url-input" 
              data-variable="${escapeHtml(part.name)}"
              placeholder="${escapeHtml(part.name)}"
            />
          </span>
        `;
      }
    }).join('');

    return `
      <div class="template-card" data-template-id="${template.id}">
        <div class="template-header">
          <span class="template-name">${escapeHtml(template.name)}</span>
          <div class="template-actions-top">
            <span class="template-category">${escapeHtml(template.category)}</span>
            <button class="favorite-btn" data-id="${template.id}">⭐ ${t('addToFavorites')}</button>
            <button class="delete-btn" data-id="${template.id}">🗑️ ${t('delete')}</button>
          </div>
        </div>
        <div class="template-url-builder">
          ${urlBuilderHtml}
          <button class="url-open-btn" data-id="${template.id}">${t('open')} →</button>
        </div>
      </div>
    `;
  }).join('');

  // Add event listeners
  elements.templatesList.querySelectorAll('.url-open-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      openTemplateUrl(e.target.dataset.id);
    });
  });

  elements.templatesList.querySelectorAll('.favorite-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      addToFavoritesFromTemplate(e.target.dataset.id);
    });
  });

  elements.templatesList.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      deleteTemplate(e.target.dataset.id);
    });
  });

  // Add Enter key support for inputs
  elements.templatesList.querySelectorAll('.url-input').forEach((input, index, inputs) => {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const card = input.closest('.template-card');
        const cardInputs = card.querySelectorAll('.url-input');
        const currentIndex = Array.from(cardInputs).indexOf(input);
        
        if (currentIndex < cardInputs.length - 1) {
          // Focus next input in same card
          cardInputs[currentIndex + 1].focus();
        } else {
          // Open URL on last input
          const templateId = card.dataset.templateId;
          openTemplateUrl(templateId);
        }
      }
    });
  });

  // Add clipboard paste on click
  elements.templatesList.querySelectorAll('.url-input').forEach(input => {
    input.addEventListener('click', function() {
      // Auto-select text on click
      this.select();
    });
  });
}

// Render favorites
function renderFavorites() {
  if (state.favorites.length === 0) {
    elements.favoritesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⭐</div>
        <div class="empty-state-text">${t('noFavorites')}</div>
      </div>
    `;
    return;
  }

  elements.favoritesList.innerHTML = state.favorites.map(favorite => `
    <div class="favorite-item">
      <div class="favorite-header">
        <span class="favorite-name">${escapeHtml(favorite.name)}</span>
      </div>
      <div class="favorite-url">${escapeHtml(favorite.url)}</div>
      <div class="favorite-actions">
        <button class="open-fav-btn" data-id="${favorite.id}">${t('open')}</button>
        <button class="remove-fav-btn" data-id="${favorite.id}">${t('remove')}</button>
      </div>
    </div>
  `).join('');

  // Add event listeners
  elements.favoritesList.querySelectorAll('.open-fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const favorite = state.favorites.find(f => f.id === e.target.dataset.id);
      if (favorite) {
        chrome.tabs.create({ url: favorite.url }, () => {
          addToHistory(favorite.url, favorite.name);
        });
        showToast(t('linkOpened'));
      }
    });
  });

  elements.favoritesList.querySelectorAll('.remove-fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      removeFromFavorites(e.target.dataset.id);
    });
  });
}

// Render history
function renderHistory() {
  if (state.history.length === 0) {
    elements.historyList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🕐</div>
        <div class="empty-state-text">${t('noHistory')}</div>
      </div>
    `;
    return;
  }

  elements.historyList.innerHTML = state.history.map(item => {
    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleString(currentLocale.replace('_', '-'));
    
    return `
      <div class="history-item" data-url="${escapeHtml(item.url)}">
        <div class="history-name">${escapeHtml(item.name)}</div>
        <div class="history-url">${escapeHtml(item.url)}</div>
        <div class="history-time">${timeStr}</div>
      </div>
    `;
  }).join('');

  // Add click handlers
  elements.historyList.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const url = item.dataset.url;
      chrome.tabs.create({ url });
      showToast(t('linkOpened'));
    });
  });
}

// Render clipboard
function renderClipboard() {
  if (state.clipboard.length === 0) {
    elements.clipboardList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-text">${t('noClipboard')}</div>
      </div>
    `;
    return;
  }

  elements.clipboardList.innerHTML = state.clipboard.map(item => {
    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleTimeString(currentLocale.replace('_', '-'), { hour: '2-digit', minute: '2-digit' });
    
    // Truncate long text
    const displayText = item.text.length > 50 
      ? item.text.substring(0, 50) + '...' 
      : item.text;
    
    return `
      <div class="clipboard-item" data-text="${escapeHtml(item.text)}" title="${t('copied')}">
        <div class="clipboard-text">${escapeHtml(displayText)}</div>
        <div class="clipboard-time">${timeStr}</div>
        <div class="clipboard-copy-icon">📋</div>
      </div>
    `;
  }).join('');

  // Add click to copy
  elements.clipboardList.querySelectorAll('.clipboard-item').forEach(item => {
    item.addEventListener('click', () => {
      const text = item.dataset.text;
      copyToClipboard(text);
      
      // Find focused input and paste
      const activeInput = document.activeElement;
      if (activeInput && activeInput.classList.contains('url-input')) {
        activeInput.value = text;
        activeInput.dispatchEvent(new Event('input'));
      }
      
      showToast(t('copied'));
    });
  });
}

// Copy to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

// Show toast notification
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 2000);
}

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Feedback popup ───────────────────────────────────────────────────────────

function setupFeedbackListeners() {
  document.getElementById('leave-feedback-btn').addEventListener('click', () => {
    openFeedbackModal(2);
  });

  document.getElementById('feedback-close').addEventListener('click', closeFeedbackModal);

  document.getElementById('feedback-yes').addEventListener('click', () => {
    closeFeedbackModal();
    chrome.tabs.create({ url: STORE_URL });
  });

  document.getElementById('feedback-no').addEventListener('click', () => {
    document.getElementById('feedback-phase-1').style.display = 'none';
    document.getElementById('feedback-phase-2').style.display = 'block';
    document.getElementById('feedback-text').focus();
  });

  document.getElementById('feedback-submit').addEventListener('click', async () => {
    const text = document.getElementById('feedback-text').value.trim();
    if (!text) {
      document.getElementById('feedback-text').focus();
      return;
    }

    const submitBtn = document.getElementById('feedback-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
      await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `Отзыв из Quick Links:\n\n${text}`
        })
      });
    } catch (e) {
      // Silently ignore network errors — don't block the user
    }

    closeFeedbackModal();
  });
}

function checkAndShowFeedback() {
  chrome.storage.local.get(['installTimestamp', 'feedbackShown'], (result) => {
    if (result.feedbackShown) return;
    if (!result.installTimestamp) return;

    const elapsed = Date.now() - result.installTimestamp;
    if (elapsed >= FEEDBACK_DELAY_MS) {
      openFeedbackModal(1);
    }
  });
}

function openFeedbackModal(phase) {
  const phase1 = document.getElementById('feedback-phase-1');
  const phase2 = document.getElementById('feedback-phase-2');
  const textArea = document.getElementById('feedback-text');
  const submitBtn = document.getElementById('feedback-submit');

  // Reset state
  phase1.style.display = phase === 1 ? 'block' : 'none';
  phase2.style.display = phase === 2 ? 'block' : 'none';
  textArea.value = '';
  submitBtn.disabled = false;
  submitBtn.textContent = 'Send feedback';

  document.getElementById('feedback-modal').style.display = 'flex';

  if (phase === 2) {
    textArea.focus();
  }
}

function closeFeedbackModal() {
  document.getElementById('feedback-modal').style.display = 'none';
  chrome.storage.local.set({ feedbackShown: true });
}

