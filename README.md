# TestGen

Сайт для генерации тестов из загруженных файлов с помощью AI (Groq).

## Что умеет

- Загрузка `.docx`, `.pdf`, `.txt` файла
- Автоматическое разбиение на темы (ищет "ДӘРІС №", "ЛЕКЦИЯ", "Тема" и т.п.)
- Генерация 15 вопросов на тему через Groq (Llama 3.3 70B)
- 3 типа вопросов: **выбор ответа**, **короткий ответ**, **сопоставление**
- Прохождение теста с вводом имени (без регистрации)
- Все результаты сохраняются в SQLite
- Графики: топ участников, средний % по темам
- Интерфейс на казахском / русском / английском

## Установка

```bash
cd /home/z4aks/testgen
python3 -m venv venv
source venv/bin/activate.fish   # для fish
# или: source venv/bin/activate  # для bash
pip install -r requirements.txt
```

## API-ключ Groq (бесплатный)

1. Открой https://console.groq.com/keys
2. Создай ключ (регистрация бесплатная)
3. Скопируй `.env.example` → `.env` и вставь ключ:

```bash
cp .env.example .env
nano .env
```

## Запуск

```bash
source venv/bin/activate.fish
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Открой http://localhost:8000

## Как пользоваться

1. **Загрузить файл** → выбрать язык → жмёшь "Загрузить"
2. AI разобьёт файл на темы (Дәріс №1, №2, …)
3. По каждой теме жми **"Сгенерировать вопросы"** — AI сделает 15 штук
4. Жми **"Начать тест"**, вводи имя, отвечай
5. **"Результаты"** → графики и таблица участников

## Структура

```
testgen/
├── backend/
│   ├── main.py       # FastAPI endpoints
│   ├── db.py         # SQLite init + схемы
│   ├── parser.py     # извлечение текста + разбиение на темы
│   ├── ai.py         # Groq генерация вопросов
│   └── scoring.py    # проверка ответов
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── i18n.js       # переводы KZ/RU/EN
├── data/testgen.db   # SQLite база (создаётся сама)
├── uploads/          # загруженные файлы
└── requirements.txt
```
