// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getContent') {
    const text = extractContent();
    sendResponse({ text });
  }
  return true;
});

// Extract readable content from the page
function extractContent() {
  // Try Readability first if available
  if (typeof Readability !== 'undefined') {
    try {
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();
      
      if (article && article.textContent) {
        return cleanText(article.textContent);
      }
    } catch (err) {
      console.log('Readability failed, falling back to basic extraction');
    }
  }
  
  // Fallback: basic content extraction
  return fallbackExtraction();
}

// Basic fallback extraction
function fallbackExtraction() {
  // Remove unwanted elements
  const unwanted = [
    'script', 'style', 'nav', 'header', 'footer', 'aside',
    'iframe', 'noscript', '.ad', '.advertisement', '.sidebar',
    '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]'
  ];
  
  const clone = document.body.cloneNode(true);
  
  unwanted.forEach(selector => {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  });
  
  // Try to find main content
  const mainContent = clone.querySelector('main, article, [role="main"], .content, .post, .entry');
  const textSource = mainContent || clone;
  
  return cleanText(textSource.textContent || textSource.innerText);
}

// Clean up extracted text
function cleanText(text) {
  return text
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove multiple newlines
    .replace(/\n\s*\n/g, '\n\n')
    // Trim
    .trim();
}
