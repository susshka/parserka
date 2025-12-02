// content.js
function extractPreText() {
  const pre = document.querySelector("pre");
  if (!pre) {
    return null;
  }
  return pre.innerText || pre.textContent;
}

// Слушаем запросы от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getPreContent") {
    const preText = extractPreText();
    sendResponse({ content: preText });
    return true; // async response
  }
});
