console.log("🔥 Background.js загружен");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("📨 Получено сообщение:", request.action);

  if (request.action === "ping") {
    sendResponse({ status: "ok" });
    return;
  }

  if (request.action === "parseScript") {
    console.log("🚀 Начинаем парсинг:", request.url);

    (async () => {
      try {
        const originalUrl = request.url;
        const newUrl = originalUrl.replace("/scripts/", "/hampter/script/");
        console.log("🔄 Переходим по:", newUrl);

        const response = await fetch(newUrl);
        console.log("📄 HTTP статус:", response.status);

        if (!response.ok) {
          sendResponse({ success: false, error: `HTTP ${response.status}` });
          return;
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const pre = doc.querySelector("pre");

        if (!pre) {
          sendResponse({ success: false, error: "Тег <pre> не найден" });
          return;
        }

        let content = pre.textContent;
        console.log("📝 Содержимое pre получено:", content.length, "символов");

        // Очистка текста
        content = content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

        // Парсим JSON
        let jsonContent;
        try {
          jsonContent = JSON.parse(content);
          console.log("✅ JSON распарсен");
        } catch (e) {
          console.error("JSON ошибка:", e);
          sendResponse({ success: false, error: "JSON.parse: " + e.message });
          return;
        }

        // Обрабатываем script
        if (jsonContent.script && typeof jsonContent.script === "string") {
          try {
            jsonContent.script = JSON.parse(jsonContent.script);
            console.log("✅ Script вложенный JSON распарсен");
          } catch (e) {
            console.log("⚠️ Script не распарсился, оставляем как строку");
          }
        }

        // Скачиваем
        const blob = new Blob([JSON.stringify(jsonContent, null, 2)], {
          type: "application/json",
        });
        const filename = `janitorai_${newUrl.split("/").pop()}.json`;
        const urlBlob = URL.createObjectURL(blob);

        chrome.downloads.download(
          {
            url: urlBlob,
            filename: filename,
            saveAs: true,
          },
          () => {
            console.log("💾 Файл отправлен на скачивание");
            sendResponse({ success: true, filename });
          }
        );
      } catch (error) {
        console.error("💥 Ошибка парсинга:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // Асинхронный ответ
  }
});
