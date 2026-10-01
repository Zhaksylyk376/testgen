const I18N = {
  kz: {
    brand: "TestGen",
    home_title: "AI жасаған тест қабырғасы",
    home_sub: "Файл жүкте — AI тақырып бойынша 15 сұрақтан жасайды",
    upload_title: "Файл жүктеу",
    upload_btn: "Жүктеу",
    language: "Тіл:",
    existing_tests: "Бұрын жүктелген тесттер",
    back: "Артқа",
    topics: "Тақырыптар",
    view_results: "Нәтижелер",
    delete: "Жою",
    your_name: "Атыңыз:",
    your_result: "Нәтижеңіз",
    all_results: "Барлық нәтижелер",
    participants: "Қатысушылар",
    submit: "Жауаптарды тапсыру",
    generate: "Сұрақтар жасау",
    regenerate: "Қайта жасау",
    start_test: "Тестті бастау",
    generating: "Жасалуда…",
    uploading: "Жүктелуде…",
    enter_name: "Атыңызды енгізіңіз",
    questions_count: "сұрақ",
    no_tests: "Әзірге тесттер жоқ",
    no_results: "Әзірге нәтиже жоқ",
    user: "Пайдаланушы",
    topic: "Тақырып",
    score: "Балл",
    date: "Күні",
    type_mc: "Таңдау",
    type_open: "Жазу",
    type_matching: "Құрастыру",
    confirm_delete: "Шынымен жоюға сенімдісіз бе?",
    file_placeholder: "Тестіңіздің тақырыбы (міндетті емес)",
    name_placeholder: "Мысалы: Асан",
  },
  ru: {
    brand: "TestGen",
    home_title: "Сайт тестов, сгенерированных AI",
    home_sub: "Загрузи файл — AI сделает по 15 вопросов на каждую тему",
    upload_title: "Загрузить файл",
    upload_btn: "Загрузить",
    language: "Язык:",
    existing_tests: "Ранее загруженные тесты",
    back: "Назад",
    topics: "Темы",
    view_results: "Результаты",
    delete: "Удалить",
    your_name: "Ваше имя:",
    your_result: "Ваш результат",
    all_results: "Все результаты",
    participants: "Участники",
    submit: "Отправить ответы",
    generate: "Сгенерировать вопросы",
    regenerate: "Пересоздать",
    start_test: "Начать тест",
    generating: "Генерация…",
    uploading: "Загрузка…",
    enter_name: "Введите имя",
    questions_count: "вопр.",
    no_tests: "Пока нет тестов",
    no_results: "Пока нет результатов",
    user: "Пользователь",
    topic: "Тема",
    score: "Балл",
    date: "Дата",
    type_mc: "Выбор",
    type_open: "Текст",
    type_matching: "Сопоставление",
    confirm_delete: "Точно удалить?",
    file_placeholder: "Название теста (не обязательно)",
    name_placeholder: "Например: Иван",
  },
  en: {
    brand: "TestGen",
    home_title: "AI-generated tests from your files",
    home_sub: "Upload a file — AI creates 15 questions per topic",
    upload_title: "Upload file",
    upload_btn: "Upload",
    language: "Language:",
    existing_tests: "Previously uploaded tests",
    back: "Back",
    topics: "Topics",
    view_results: "Results",
    delete: "Delete",
    your_name: "Your name:",
    your_result: "Your result",
    all_results: "All results",
    participants: "Participants",
    submit: "Submit answers",
    generate: "Generate questions",
    regenerate: "Regenerate",
    start_test: "Start test",
    generating: "Generating…",
    uploading: "Uploading…",
    enter_name: "Enter your name",
    questions_count: "q.",
    no_tests: "No tests yet",
    no_results: "No results yet",
    user: "User",
    topic: "Topic",
    score: "Score",
    date: "Date",
    type_mc: "Choice",
    type_open: "Text",
    type_matching: "Matching",
    confirm_delete: "Really delete?",
    file_placeholder: "Test title (optional)",
    name_placeholder: "e.g. John",
  },
};

let CURRENT_LANG = localStorage.getItem("lang") || "kz";

function t(key) { return (I18N[CURRENT_LANG] && I18N[CURRENT_LANG][key]) || key; }

function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  const titleInput = document.getElementById("title-input");
  if (titleInput) titleInput.placeholder = t("file_placeholder");
  const nameInput = document.getElementById("user-name");
  if (nameInput) nameInput.placeholder = t("name_placeholder");
  document.querySelectorAll(".lang-switch button").forEach(b => b.classList.remove("active"));
  const activeBtn = document.getElementById("btn-" + CURRENT_LANG);
  if (activeBtn) activeBtn.classList.add("active");
  document.documentElement.lang = CURRENT_LANG;
}

function setLang(lang) {
  CURRENT_LANG = lang;
  localStorage.setItem("lang", lang);
  applyI18n();
  if (typeof refreshView === "function") refreshView();
}
