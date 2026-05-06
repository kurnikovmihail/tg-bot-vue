export const SERVICE_REFERAT = 'referat'
export const SERVICE_PRESENTATION = 'presentation'
export const SERVICE_REPORT = 'report'
export const SERVICE_ESSAY = 'essay'
export const SERVICE_INDIVIDUAL_PROJECT = 'individual_project'
export const SERVICE_RESEARCH_WORK = 'research_work'
export const SERVICE_COURSEWORK = 'coursework'
export const SERVICE_LAB_WORK = 'lab_work'
export const SERVICE_CUSTOM_WORK = 'custom_work'

export const ORDER_STATUS_AWAITING_PAYMENT = 'awaiting_payment'
export const ORDER_STATUS_IN_PROGRESS = 'in_progress'
export const ORDER_STATUS_READY = 'ready'
export const ORDER_STATUS_IN_REVISION = 'in_revision'
export const ORDER_STATUS_COMPLETED = 'completed'
export const ORDER_STATUS_CANCELED = 'canceled'

export const YES_NO_CHOICES = [
  ['yes', '✅ Да'],
  ['no', '❌ Нет']
]

export const PROMPT_TAIL =
  'Поделитесь деталями максимально точно: чем конкретнее ввод, тем сильнее и точнее получится итоговая работа.'

export const LLM_CHANNEL_RULE =
  'Ответ готовится для Telegram. Формируй материал структурно и отправляй результат в формате, который открывается на любых устройствах, включая мобильные.'

export const LLM_GLOBAL_QUALITY_RULES = `Ты — мой академический помощник по учебным работам. Твоя задача — помогать мне делать работу так, чтобы она выглядела как качественно выполненная студентом, соответствовала заданию, была логичной, аккуратно оформленной и не содержала фактических ошибок.

Работай по следующим правилам:

1. Сначала внимательно проанализируй тему, цель, задачи, формат работы и все требования.
2. Если я прикрепил методичку, образец, критерии, план, файл преподавателя или пример оформления — опирайся на них в первую очередь и никогда не уклоняйся от поставленных правил.
3. Ничего не придумывай как факт, если ты не уверен. В спорных местах:
- явно указывай, что момент требует проверки;
- не выдавай сомнительную информацию за точную.
4. Пиши не шаблонно, а естественно, связно и по-студенчески грамотно, но на хорошем уровне.
5. Избегай воды, тавтологии, слишком общих фраз и пустых абзацев.
6. Делай текст содержательным: с анализом, причинно-следственными связями, выводами и логическими переходами.
7. Следи, чтобы работа действительно раскрывала тему, а не просто была “похожа на работу”.
8. Если тема историческая, юридическая, экономическая, социальная или научная — уделяй особое внимание точности формулировок.
9. Если работа исследовательская, обязательно выделяй:
- актуальность,
- проблему,
- цель,
- задачи,
- объект,
- предмет,
- методы,
- практическую значимость,
- выводы.
10. Если нужна практическая часть — предлагай реалистичный и уместный вариант, который подходит под тему и выглядит убедительно.
11. Если нужна презентация — делай ее не как пересказ текста, а как краткую визуальную опору для защиты.
12. Если нужен продукт проекта — предлагай такой продукт, который:
- связан с темой,
- выглядит осмысленно,
- можно показать на защите,
- усиливает сам проект.

Формат работы:
- сначала кратко определи, что именно нужно сделать;
- затем предложи оптимальную структуру;
- после этого переходи к написанию;
- в конце делай самопроверку на соответствие теме и требованиям.

Требования к качеству текста:
- логичная структура;
- академический, но живой язык;
- точные формулировки;
- отсутствие явных штампов нейросети;
- отсутствие противоречий между разделами;
- каждый раздел должен работать на общую цель;
- выводы должны вытекать из основного текста, а не быть формальными.

Очень важно:
- не сокращай качество ради скорости;
- если формулировка темы неудачная — предложи 2-3 более сильных варианта;
- если требования неполные — сделай наиболее академически правильный вариант;
- если есть риск, что преподаватель заметит шаблонность, перепиши текст более естественно и убедительно.

Когда отвечаешь:
только файлами, которые открываются на любом устройстве, включая мобильные (Android, iPhone и т.д.).`

function q(prompt, includeTail = true) {
  return includeTail ? `${prompt}\n\n${PROMPT_TAIL}` : prompt
}

export const SERVICE_MENU_LABELS = {
  [SERVICE_REFERAT]: '📘 Реферат',
  [SERVICE_PRESENTATION]: '📊 Презентация',
  [SERVICE_REPORT]: '🗣️ Доклад',
  [SERVICE_ESSAY]: '✍️ Эссе',
  [SERVICE_INDIVIDUAL_PROJECT]: '📁 Индивидуальный проект',
  [SERVICE_RESEARCH_WORK]: '🔬 Исследовательская работа',
  [SERVICE_COURSEWORK]: '🎓 Курсовая работа',
  [SERVICE_LAB_WORK]: '🧪 Лабораторная работа',
  [SERVICE_CUSTOM_WORK]: '⚙️ Своя работа (свои параметры)'
}

export const SERVICE_MENU_ORDER = [
  SERVICE_REFERAT,
  SERVICE_PRESENTATION,
  SERVICE_REPORT,
  SERVICE_ESSAY,
  SERVICE_INDIVIDUAL_PROJECT,
  SERVICE_RESEARCH_WORK,
  SERVICE_COURSEWORK,
  SERVICE_LAB_WORK,
  SERVICE_CUSTOM_WORK
]

export const OFFERS = {
  [SERVICE_REFERAT]: {
    key: SERVICE_REFERAT,
    title: '📘 Реферат под ваш запрос',
    shortTitle: 'Реферат',
    priceRub: 300,
    scope: 'Полноценный текст по теме: введение, основная часть, выводы.',
    deadlineInfo: 'Обычно от 2 до 24 часов (зависит от сложности).',
    descriptionPoints: [
      'Логичная структура и аккуратная подача материала.',
      'Адаптация под уровень: школа, колледж, вуз.',
      'Рекомендуемый объем: от 4 до 35 страниц.',
      'До 7 правок после выдачи готовой версии.'
    ],
    fields: [
      { key: 'topic', label: 'Тема', prompt: q('Введите тему реферата.'), inputType: 'text', choices: [] },
      {
        key: 'subject',
        label: 'Предмет',
        prompt: q('По какому предмету нужен реферат?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'volume',
        label: 'Объем',
        prompt: q('Какой объем нужен? Допустимый диапазон: 4-35 страниц.'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'level',
        label: 'Класс / курс',
        prompt: q('Для какого класса или курса работа?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'literature_required',
        label: 'Список литературы',
        prompt: q('Нужен ли список литературы?'),
        inputType: 'choice',
        choices: YES_NO_CHOICES
      },
      {
        key: 'special_requirements',
        label: 'Особые требования',
        prompt: q('Есть требования преподавателя? Если нет, напишите: нет.'),
        inputType: 'text',
        choices: []
      }
    ]
  },
  [SERVICE_PRESENTATION]: {
    key: SERVICE_PRESENTATION,
    title: '📊 Презентация с продуманной структурой',
    shortTitle: 'Презентация',
    priceRub: 400,
    scope: 'Структура, сценарий, содержание и подача материала по теме.',
    deadlineInfo: 'Обычно от 3 до 24 часов.',
    descriptionPoints: [
      'Базовый пакет: 12 слайдов (можно указать другое количество).',
      'Допустимый диапазон: 6-30 слайдов.',
      'Баланс смысла и визуальной логики.',
      'До 7 правок после выдачи готовой версии.'
    ],
    fields: [
      { key: 'topic', label: 'Тема', prompt: q('Введите тему презентации.'), inputType: 'text', choices: [] },
      {
        key: 'subject',
        label: 'Предмет',
        prompt: q('По какому предмету нужна презентация?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'slides_count',
        label: 'Количество слайдов',
        prompt: q('Сколько слайдов нужно? Допустимый диапазон: 6-30.'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'level',
        label: 'Уровень обучения',
        prompt: q('Для какого уровня обучения работа?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'style',
        label: 'Стиль',
        prompt: q('Какой стиль предпочитаете?'),
        inputType: 'choice',
        choices: [
          ['strict', '🧾 Строгий / деловой'],
          ['visual', '🎨 Более визуальный'],
          ['mixed', '⚖️ Сбалансированный']
        ]
      },
      {
        key: 'images_required',
        label: 'Нужны картинки',
        prompt: q('Нужно ли подбирать изображения?'),
        inputType: 'choice',
        choices: YES_NO_CHOICES
      },
      {
        key: 'teacher_requirements',
        label: 'Требования преподавателя',
        prompt: q('Есть отдельные требования преподавателя? Если нет, напишите: нет.'),
        inputType: 'text',
        choices: []
      }
    ]
  },
  [SERVICE_REPORT]: {
    key: SERVICE_REPORT,
    title: '🗣️ Доклад для выступления',
    shortTitle: 'Доклад',
    priceRub: 500,
    scope: 'Краткая и четкая работа для устного или письменного выступления.',
    deadlineInfo: 'Обычно от 2 до 18 часов.',
    descriptionPoints: [
      'Структура выступления: тезисы, логика, вывод.',
      'Рекомендуемый объем текста: 1-8 страниц.',
      'Подготовка под формат пары/семинара.',
      'До 7 правок после выдачи готовой версии.'
    ],
    fields: [
      { key: 'topic', label: 'Тема', prompt: q('Какая тема доклада?'), inputType: 'text', choices: [] },
      {
        key: 'subject',
        label: 'Предмет',
        prompt: q('По какому предмету или дисциплине нужен доклад?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'duration',
        label: 'Длительность',
        prompt: q('На сколько минут рассчитано выступление?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'format',
        label: 'Формат',
        prompt: q('Нужен только текст или еще тезисный план для устной речи?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'sources_required',
        label: 'Источники',
        prompt: q('Нужен ли список источников?'),
        inputType: 'choice',
        choices: YES_NO_CHOICES
      },
      {
        key: 'teacher_requirements',
        label: 'Требования преподавателя',
        prompt: q('Есть ли критерии оценки, которые важно учесть?'),
        inputType: 'text',
        choices: []
      }
    ]
  },
  [SERVICE_ESSAY]: {
    key: SERVICE_ESSAY,
    title: '✍️ Эссе с авторской позицией',
    shortTitle: 'Эссе',
    priceRub: 399,
    scope: 'Рассуждение на тему с аргументами, позицией автора и выводом.',
    deadlineInfo: 'Обычно от 3 до 24 часов.',
    descriptionPoints: [
      'Сильная личная позиция и аргументация.',
      'Рекомендуемый объем: 1-12 страниц.',
      'Нормальный академический стиль без «воды».',
      'До 7 правок после выдачи готовой версии.'
    ],
    fields: [
      { key: 'topic', label: 'Тема', prompt: q('Какая тема эссе?'), inputType: 'text', choices: [] },
      {
        key: 'subject',
        label: 'Предмет',
        prompt: q('По какому предмету или курсу нужно эссе?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'volume',
        label: 'Объем',
        prompt: q('Какой объем нужен? Допустимый диапазон: 1-12 страниц или эквивалент в словах.'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'position',
        label: 'Позиция автора',
        prompt: q('Какую позицию нужно отстаивать в работе?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'arguments',
        label: 'Ключевые аргументы',
        prompt: q('Какие аргументы, примеры или кейсы обязательно включить?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'style',
        label: 'Стиль',
        prompt: q('Стиль ближе к академическому или более живому публицистическому?'),
        inputType: 'text',
        choices: []
      }
    ]
  },
  [SERVICE_INDIVIDUAL_PROJECT]: {
    key: SERVICE_INDIVIDUAL_PROJECT,
    title: '📁 Индивидуальный проект',
    shortTitle: 'Индивидуальный проект',
    priceRub: 2200,
    scope: 'Крупная работа с полной структурой и, при необходимости, практическим продуктом.',
    deadlineInfo: 'Обычно от 24 часов до нескольких дней.',
    descriptionPoints: [
      'Титульный лист, содержание, введение, основная часть, выводы, источники.',
      'Рекомендуемый объем: 12-60 страниц (зависит от требований).',
      'Работа под реальные требования преподавателя/методички.',
      'До 7 правок после выдачи готовой версии.'
    ],
    fields: [
      {
        key: 'topic',
        label: 'Тема проекта',
        prompt: q('Какая тема индивидуального проекта?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'subject',
        label: 'Предмет / направление',
        prompt: q('В рамках какого предмета или направления выполняется проект?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'goal',
        label: 'Цель проекта',
        prompt: q('Какую главную цель должен решить проект?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'tasks',
        label: 'Задачи проекта',
        prompt: q('Какие задачи обязательно нужно раскрыть по пунктам?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'work_parts',
        label: 'Состав работы',
        prompt: q(
          'Из каких частей должна состоять работа? Например: документ Word, презентация, практический продукт (бот/сайт/макет).'
        ),
        inputType: 'text',
        choices: []
      },
      {
        key: 'practical_part',
        label: 'Практическая часть',
        prompt: q('Нужен ли практический продукт? Если да, какой именно?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'methodical_materials',
        label: 'Методичка / требования',
        prompt: q(
          'Есть методичка, шаблон или требования к оформлению? Можно написать текстом и/или прикрепить файлом или скриншотами в чат.'
        ),
        inputType: 'attachments',
        choices: []
      }
    ]
  },
  [SERVICE_RESEARCH_WORK]: {
    key: SERVICE_RESEARCH_WORK,
    title: '🔬 Исследовательская работа',
    shortTitle: 'Исследовательская работа',
    priceRub: 2499,
    scope: 'Работа с проблемой, гипотезой, методами исследования, анализом и выводами.',
    deadlineInfo: 'Обычно от 24 часов до нескольких дней.',
    descriptionPoints: [
      'Научная логика и корректная структура исследования.',
      'Рекомендуемый объем: 10-70 страниц.',
      'Фокус на аналитике и аргументации выводов.',
      'До 7 правок после выдачи готовой версии.'
    ],
    fields: [
      {
        key: 'topic',
        label: 'Тема',
        prompt: q('Как звучит тема исследовательской работы?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'problem',
        label: 'Проблема исследования',
        prompt: q('Какую проблему нужно изучить и решить?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'hypothesis',
        label: 'Гипотеза',
        prompt: q('Какая гипотеза должна быть проверена?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'methods',
        label: 'Методы',
        prompt: q('Какие методы исследования нужно использовать?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'data_source',
        label: 'Данные / материалы',
        prompt: q('На каких данных, источниках или наблюдениях строится анализ?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'expected_result',
        label: 'Ожидаемый результат',
        prompt: q('Какой итог и какие выводы ожидаете увидеть?'),
        inputType: 'text',
        choices: []
      }
    ]
  },
  [SERVICE_COURSEWORK]: {
    key: SERVICE_COURSEWORK,
    title: '🎓 Курсовая работа',
    shortTitle: 'Курсовая работа',
    priceRub: 2999,
    scope: 'Объемная работа с теорией, практикой, анализом источников и требованиями вуза/колледжа.',
    deadlineInfo: 'Обычно от 2 дней и выше.',
    descriptionPoints: [
      'Полная академическая структура курсовой.',
      'Рекомендуемый объем: 20-90 страниц.',
      'Учет методички и требований кафедры.',
      'До 7 правок после выдачи готовой версии.'
    ],
    fields: [
      {
        key: 'topic',
        label: 'Тема курсовой',
        prompt: q('Какая тема курсовой работы?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'specialty',
        label: 'Специальность / дисциплина',
        prompt: q('Для какой специальности или дисциплины пишется работа?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'volume',
        label: 'Объем',
        prompt: q('Какой объем нужен? Допустимый диапазон: 20-90 страниц.'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'structure',
        label: 'Структура',
        prompt: q('Нужна стандартная структура или есть готовый план от преподавателя?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'practical_part',
        label: 'Практическая часть',
        prompt: q('Какая практическая часть обязательна (расчеты, кейс, анализ предприятия и т.п.)?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'format_requirements',
        label: 'Требования к оформлению',
        prompt: q('Есть ГОСТ, методичка, требования по ссылкам и списку литературы? Можно прикрепить файл или скриншоты.'),
        inputType: 'attachments',
        choices: []
      }
    ]
  },
  [SERVICE_LAB_WORK]: {
    key: SERVICE_LAB_WORK,
    title: '🧪 Лабораторная работа',
    shortTitle: 'Лабораторная работа',
    priceRub: 400,
    scope: 'Работа по результатам опыта, эксперимента или компьютерного задания.',
    deadlineInfo: 'Обычно от 2 до 24 часов.',
    descriptionPoints: [
      'Структура: цель, ход, результаты, выводы.',
      'Рекомендуемый объем: 2-25 страниц.',
      'Подстройка под формат предмета и задания.',
      'До 7 правок после выдачи готовой версии.'
    ],
    fields: [
      {
        key: 'topic',
        label: 'Тема / номер лабораторной',
        prompt: q('Какая тема или номер лабораторной работы?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'subject',
        label: 'Предмет',
        prompt: q('По какому предмету выполняется лабораторная?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'task',
        label: 'Условие задания',
        prompt: q('Пришлите или опишите точное условие задания.'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'tools',
        label: 'Оборудование / ПО',
        prompt: q('Какие инструменты, оборудование или программы должны использоваться?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'input_data',
        label: 'Исходные данные',
        prompt: q('Какие исходные данные, параметры или результаты эксперимента нужно использовать?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'output_format',
        label: 'Формат отчета',
        prompt: q('Нужен полный отчет, только выводы или конкретная форма таблиц/графиков?'),
        inputType: 'text',
        choices: []
      }
    ]
  },
  [SERVICE_CUSTOM_WORK]: {
    key: SERVICE_CUSTOM_WORK,
    title: '⚙️ Своя работа под ваши параметры',
    shortTitle: 'Своя работа',
    priceRub: 1490,
    scope: 'Свободный формат: вы задаете структуру, объем, формат сдачи и критерии.',
    deadlineInfo: 'Срок зависит от сложности и деталей заказа.',
    descriptionPoints: [
      'Вы задаете тип работы, структуру и критерии оценки.',
      'Подходит для нестандартных задач.',
      'Рекомендуемый объем: от 1 до 120 страниц или эквивалент.',
      'До 7 правок после выдачи готовой версии.'
    ],
    fields: [
      {
        key: 'work_type',
        label: 'Тип работы',
        prompt: q(
          'Какой именно формат нужен? Например: аналитический отчет, кейс, конспект, сценарий, бизнес-план и т.д.'
        ),
        inputType: 'text',
        choices: []
      },
      {
        key: 'topic',
        label: 'Тема',
        prompt: q('Какая тема или задача работы?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'subject',
        label: 'Предмет / область',
        prompt: q('К какому предмету или области относится работа?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'volume',
        label: 'Объем',
        prompt: q('Какой объем нужен? Укажите страницы/слова/слайды. Допустимый диапазон: 1-120 страниц (или эквивалент).'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'structure',
        label: 'Структура',
        prompt: q('Какой план или структура должна быть у работы?'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'output_parts',
        label: 'Формат результата',
        prompt: q('Что нужно на выходе? Например: Word-документ, презентация, таблица, архив материалов.'),
        inputType: 'text',
        choices: []
      },
      {
        key: 'requirements',
        label: 'Требования и критерии',
        prompt: q('Есть методичка, критерии оценки или шаблоны? Можно прикрепить файлом/скриншотами.'),
        inputType: 'attachments',
        choices: []
      }
    ]
  }
}

export const STATUS_LABELS = {
  [ORDER_STATUS_AWAITING_PAYMENT]: 'Ожидает оплаты',
  [ORDER_STATUS_IN_PROGRESS]: 'В работе',
  [ORDER_STATUS_READY]: 'Готов',
  [ORDER_STATUS_IN_REVISION]: 'На доработке',
  [ORDER_STATUS_COMPLETED]: 'Завершен',
  [ORDER_STATUS_CANCELED]: 'Отменен'
}

export const FIELD_VALUE_LABELS = {
  yes: 'Да',
  no: 'Нет',
  strict: 'Строгий / деловой',
  visual: 'Более визуальный',
  mixed: 'Сбалансированный'
}

export function getOffer(serviceKey) {
  return OFFERS[serviceKey]
}

export function getFieldLabelValue(rawValue) {
  return FIELD_VALUE_LABELS[rawValue] || rawValue
}

export function getServiceMenuItems() {
  return SERVICE_MENU_ORDER.map((serviceKey) => [serviceKey, SERVICE_MENU_LABELS[serviceKey]])
}

export function isServiceSupported(serviceKey) {
  return Object.prototype.hasOwnProperty.call(OFFERS, serviceKey)
}
