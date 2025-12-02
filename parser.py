from playwright.sync_api import sync_playwright
import sys
import json
from urllib.parse import urlparse, urlunparse
from datetime import datetime
import time
import json
import re

def clean_text(raw_text):

    # Попытка десериализовать JSON из текста:
    # - Удаляет управляющие символы, не трогая нужные escape-последовательности
    # - Парсит через json.loads для правильного преобразования escape-последовательностей
    # - Конвертирует обратно в строку с корректным форматированием

    # 1. Удаляем управляющие символы кроме \n, \t, \r
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', raw_text)
    
    try:
        # 2. Парсим JSON для исправления escape-последовательностей
        data = json.loads(cleaned)
    except json.JSONDecodeError as e:
        print(f"Ошибка JSON декодирования: {e}")
        # Если ошибка, возвращаем исходный текст без изменений
        return raw_text
    
    # 3. Конвертируем обратно в строку, уже с корректными экранированием
    return json.dumps(data, ensure_ascii=False, indent=2)

def transform_url(original_url):
    parsed = urlparse(original_url)
    path_parts = parsed.path.strip('/').split('/')
    if len(path_parts) >= 2 and path_parts[0] == 'scripts':
        new_path_parts = ['hampter', 'script'] + path_parts[1:]
        new_path = '/' + '/'.join(new_path_parts)
    else:
        raise ValueError("URL должен быть в формате /scripts/ID")
    new_url = urlunparse((
        parsed.scheme, parsed.netloc, new_path,
        parsed.params, parsed.query, parsed.fragment
    ))
    return new_url

def save_to_json(content, filename='script_content.json'):
    data = {
        "content": content,
        "timestamp": datetime.now().isoformat()
    }
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"Содержимое сохранено в {filename}")

def process_script_block(input_file, output_file=None):
    """
    Извлекает блок script из JSON, парсит его содержимое и перезаписывает файл
    """
    if output_file is None:
        output_file = input_file
    
    # Читаем исходный JSON
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"🔍 Исходный JSON загружен. Ключи: {list(data.keys())}")
    
    # Рекурсивный поиск блока script
    def find_script(obj, path_parts=[]):
        """Возвращает (script_content, path_parts) где path_parts - список ключей для навигации"""
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k == "script" and isinstance(v, str):
                    return v, path_parts + [k]
                elif isinstance(v, dict):
                    result = find_script(v, path_parts + [k])
                    if result[0]:
                        return result
                elif isinstance(v, list):
                    for i, item in enumerate(v):
                        result = find_script(item, path_parts + [k, i])
                        if result[0]:
                            return result
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                result = find_script(item, path_parts + [i])
                if result[0]:
                    return result
        return None, None
    
    script_content, path = find_script(data)
    
    if not script_content:
        print("❌ Блок 'script' не найден")
        print("Доступные ключи в корне:", list(data.keys()))
        return
    
    print(f"✅ Найден блок script по пути: {' -> '.join(map(str, path))}")
    print(f"📝 Обрабатываем содержимое script ({len(script_content)} символов)")
    
    try:
        # Очищаем и парсим содержимое script
        cleaned_script = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', '', script_content)
        script_data = json.loads(cleaned_script)
        
        print("✅ Script успешно распарсен как JSON")
        
        # Заменяем строку на объект по найденному пути
        current = data
        for i, key in enumerate(path[:-1]):  # До предпоследнего ключа
            if isinstance(key, int):  # Массив
                current = current[key]
            else:  # Словарь
                current = current[key]
        
        # Последний ключ (script) заменяем на распарсенный объект
        last_key = path[-1]
        current[last_key] = script_data
        
        # Сохраняем обновленный JSON
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"✅ Файл перезаписан: {output_file}")
        print(f"📊 Script теперь содержит {len(json.dumps(script_data, ensure_ascii=False))} символов")
        
    except json.JSONDecodeError as e:
        print(f"❌ Ошибка парсинга script: {e}")
        print("📄 Сырой script (первые 300 символов):")
        print(repr(script_content[:300]))
    except Exception as e:
        print(f"❌ Неожиданная ошибка: {e}")
        import traceback
        traceback.print_exc()

def main():
    if len(sys.argv) != 2:
        print("Использование: python playwright_parser_human.py 'https://janitorai.com/scripts/ID'")
        sys.exit(1)

    original_url = sys.argv[1].strip()
    print(f"Оригинальная ссылка: {original_url}")

    try:
        new_url = transform_url(original_url)
        print(f"Новая ссылка: {new_url}")
    except ValueError as e:
        print(f"Ошибка в URL: {e}")
        sys.exit(1)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # Голый браузер для лучшего обхода защиты
        page = browser.new_page()
        try:
            page.goto(new_url, timeout=30000)
            # Простая имитация движения мышки
            page.mouse.move(100, 100)
            time.sleep(0.5)
            page.mouse.move(150, 120)
            time.sleep(0.5)
            
            content = None
            for _ in range(3):
                pre = page.query_selector("pre")
                if pre:
                    text = pre.inner_text()
                    if "Access Restricted" not in text:
                        content = text.strip()
                        break
                # обновляем страницу, если заблокированы
                page.reload()
                time.sleep(2)
            
            if not content:
                print("Доступ заблокирован firewall или содержимое <pre> недоступно")
                sys.exit(1)

            print("Содержимое <pre> тега успешно получено")
            print("-" * 50)
            print(content[:300] + ("..." if len(content) > 300 else ""))
            print("-" * 50)
            clean_content = clean_text(content)
            #clean2_content = clean_text(clean_content)
            #print(clean_content)
            json_content = json.loads(clean_content)
            #print(json_content)

            # if(json_content["script"]):
            #     scr = json.loads(json_content["script"])
            #     json_content.script = scr
            print(clean_content)
            save_to_json(json_content)
            #save_to_json(content)

        except Exception as e:
            print(f"Ошибка при загрузке страницы: {e}")
            sys.exit(1)
        finally:
            browser.close()       
        process_script_block("script_content.json")

if __name__ == "__main__":
    main()
