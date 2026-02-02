/*
 * Simplified Readability implementation for Chrome extension
 * Based on Mozilla's Readability algorithm concepts
 */

function Readability(doc) {
  this.doc = doc;
}

Readability.prototype = {
  parse: function() {
    const doc = this.doc;
    
    // Remove unwanted elements
    const unwantedTags = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe', 'noscript', 'form', 'button', 'input', 'select', 'textarea', 'svg', 'canvas', 'video', 'audio'];
    unwantedTags.forEach(tag => {
      const elements = doc.getElementsByTagName(tag);
      while (elements.length > 0) {
        elements[0].remove();
      }
    });
    
    // Remove elements by class/id patterns
    const unwantedPatterns = /nav|sidebar|footer|header|menu|ad|advertisement|banner|social|share|comment|related|widget|popup|modal/i;
    const allElements = doc.getElementsByTagName('*');
    const toRemove = [];
    
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      const classAndId = (el.className || '') + ' ' + (el.id || '');
      if (unwantedPatterns.test(classAndId)) {
        toRemove.push(el);
      }
    }
    
    toRemove.forEach(el => el.remove());
    
    // Find the main content
    const contentSelectors = ['article', 'main', '[role="main"]', '.post', '.entry', '.content', '.article', '#content', '#main'];
    let content = null;
    
    for (const selector of contentSelectors) {
      content = doc.querySelector(selector);
      if (content) break;
    }
    
    // If no content container found, use body
    if (!content) {
      content = doc.body;
    }
    
    // Get title
    let title = '';
    const titleEl = doc.querySelector('h1') || doc.querySelector('title');
    if (titleEl) {
      title = titleEl.textContent.trim();
    }
    
    // Clean the text
    let textContent = content.textContent || '';
    textContent = textContent
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
    
    return {
      title: title,
      textContent: textContent,
      content: content.innerHTML
    };
  }
};

// Export for use
if (typeof module !== 'undefined') {
  module.exports = Readability;
}
