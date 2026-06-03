// Content blocker module (extracted from faq.js)
export function setupContentBlocker() {
  const WHITELISTED_IFRAME_HOSTS = ['drive.google.com'];
  function blockUnwantedElements(nodeList) {
    for (const node of nodeList) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches && node.matches('.web-floating-button')) {
          node.remove();
          console.log('Blocked .web-floating-button element.');
        } else if (node.querySelectorAll) {
          const floatingButtons = node.querySelectorAll('.web-floating-button');
          floatingButtons.forEach(btn => { btn.remove(); console.log('Blocked .web-floating-button element.'); });
        }
        if (node.tagName === 'IFRAME') {
          try {
            const url = new URL(node.src);
            if (!WHITELISTED_IFRAME_HOSTS.includes(url.hostname)) {
              node.remove();
              console.log(`Blocked third-party iframe from: ${url.hostname}`);
            }
          } catch (e) { /* ignore invalid/relative URLs */ }
        } else if (node.querySelectorAll) {
          const iframes = node.querySelectorAll('iframe');
          iframes.forEach(iframe => {
            try {
              const url = new URL(iframe.src);
              if (!WHITELISTED_IFRAME_HOSTS.includes(url.hostname)) {
                iframe.remove();
                console.log(`Blocked third-party iframe from: ${url.hostname}`);
              }
            } catch (e) { /* ignore invalid/relative URLs */ }
          });
        }
      }
    }
  }
  blockUnwantedElements(document.body.children);
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        blockUnwantedElements(mutation.addedNodes);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}