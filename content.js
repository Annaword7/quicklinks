// Content script that monitors copy events on all pages
// This runs on every webpage and captures copied text

function getSelectedText() {
  // First try standard selection (works for regular page text)
  let text = window.getSelection().toString();

  // Fallback for input/textarea elements where getSelection() returns empty
  if (!text || !text.trim()) {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') &&
        typeof active.selectionStart === 'number') {
      text = active.value.substring(active.selectionStart, active.selectionEnd);
    }
  }

  return text ? text.trim() : '';
}

function sendToBackground(text) {
  if (!text) return;
  chrome.runtime.sendMessage({
    type: 'clipboard-copy',
    text: text,
    timestamp: new Date().toISOString()
  }).catch((err) => {
    console.log('QuickLinks: Failed to send clipboard data:', err);
  });
}

document.addEventListener('copy', () => {
  try {
    const text = getSelectedText();
    if (text) sendToBackground(text);
  } catch (err) {
    console.log('QuickLinks: Copy event error:', err);
  }
});

// Also monitor cut events
document.addEventListener('cut', () => {
  try {
    const text = getSelectedText();
    if (text) sendToBackground(text);
  } catch (err) {
    console.log('QuickLinks: Cut event error:', err);
  }
});

console.log('QuickLinks: Content script loaded');
