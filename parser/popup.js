document.addEventListener("DOMContentLoaded", () => {
  const parseBtn = document.getElementById("parseBtn");
  const status = document.getElementById("status");

  function log(msg) {
    console.log(msg);
    status.textContent += msg + "\n";
    status.scrollTop = status.scrollHeight;
  }

  parseBtn.addEventListener("click", async () => {
    parseBtn.disabled = true;
    status.textContent = "";
    log("🚀 Запуск парсера...");

    try {
      // 1. Получаем активную вкладку
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      log(`📄 Текущая страница: ${tab.url}`);

      if (!tab.url.includes("janitorai.com/scripts/")) {
        throw new Error("🔴 Откройте janitorai.com/scripts/ID");
      }

      // 2. Преобразуем URL
      const newUrl = tab.url.replace("/scripts/", "/hampter/script/");
      log(`🔄 Переходим: ${newUrl}`);

      // 3. Переключаем вкладку на новый URL
      log("📱 Переключаем вкладку...");
      await chrome.tabs.update(tab.id, { url: newUrl });

      // 4. Ждем загрузки страницы (Cloudflare + контент)
      log("⏳ Ждем загрузки (Cloudflare обход)...");
      await new Promise((resolve) => setTimeout(resolve, 7000)); // 7 сек для полной загрузки

      // 5. Запрашиваем содержимое <pre> из content script
      log("🔍 Извлекаем <pre> из DOM...");

      chrome.tabs.sendMessage(
        tab.id,
        { action: "getPreContent" },
        async (response) => {
          if (chrome.runtime.lastError || !response) {
            log("❌ Content script не отвечает. Пробуем напрямую...");

            // Fallback: chrome.tabs.executeScript
            try {
              const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => {
                  const pre = document.querySelector("pre");
                  return pre ? pre.innerText || pre.textContent : null;
                },
              });

              const preContent = results[0].result;
              if (!preContent) throw new Error("Тег <pre> не найден");

              processContent(preContent);
            } catch (err) {
              log(`❌ Fallback тоже не сработал: ${err.message}`);
              parseBtn.disabled = false;
            }
            return;
          }

          if (!response.content) {
            throw new Error("Тег <pre> не найден на странице");
          }

          log(`✅ <pre> получен: ${response.content.length} символов`);
          processContent(response.content);
        }
      );
    } catch (error) {
      log(`❌ Ошибка: ${error.message}`);
      parseBtn.disabled = false;
    }
  });

  // === ОБРАБОТКА СОДЕРЖИМОГО (копия Python clean_text + process_script_block) ===
  function processContent(rawContent) {
    try {
      log("🧹 Очищаем текст...");

      // 1. Удаляем управляющие символы (как в Python)
      let content = rawContent.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

      // 2. Парсим основной JSON
      let jsonContent;
      try {
        jsonContent = JSON.parse(content);
        log("✅ Основной JSON распарсен");
      } catch (e) {
        throw new Error("JSON.parse основной: " + e.message);
      }

      // 3. Рекурсивно ищем и парсим все поля "script"
      function parseNestedScripts(obj) {
        if (typeof obj === "string" && obj.includes('"script"')) {
          try {
            return JSON.parse(obj);
          } catch (e) {
            return obj;
          }
        }

        if (obj && typeof obj === "object") {
          if (Array.isArray(obj)) {
            return obj.map(parseNestedScripts);
          } else {
            const newObj = {};
            for (const [key, value] of Object.entries(obj)) {
              if (key === "script" && typeof value === "string") {
                try {
                  newObj[key] = JSON.parse(
                    value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
                  );
                  log(`✅ Вложенный script в ${key} распарсен`);
                } catch (e) {
                  newObj[key] = value;
                }
              } else {
                newObj[key] = parseNestedScripts(value);
              }
            }
            return newObj;
          }
        }
        return obj;
      }

      jsonContent = parseNestedScripts(jsonContent);
      log("✅ Все вложенные script обработаны");

      // 4. Скачиваем готовый JSON
      log("💾 Создаем файл...");
      const id =
        new URLSearchParams(new URL(window.location.href).search).get("id") ||
        document.URL.split("/").pop();
      const filename = `janitorai_script_${id}.json`;

      const blob = new Blob([JSON.stringify(jsonContent, null, 2)], {
        type: "application/json;charset=utf-8",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      log(`🎉 Файл скачан: ${filename}`);
      log("✅ Готово!");
    } catch (error) {
      log(`❌ Ошибка обработки: ${error.message}`);
      console.error(error);
    } finally {
      parseBtn.disabled = false;
    }
  }
});
