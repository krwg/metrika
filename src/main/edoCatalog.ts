



export type EdoFieldDef = {
  key: string;
  label: string;
  type: 'text' | 'date' | 'textarea' | 'number' | 'select';
  required?: boolean;
  placeholder?: string;
  options?: string[];
};

export type EdoCatalogItem = {
  code: string;
  name: string;
  category: 'hr' | 'warehouse' | 'tax' | 'other';
  category_label: string;
  form_type: string;
  description: string;
  keywords: string;
  fields: EdoFieldDef[];
  title_template: string;
  body_template: string;
  sort_order: number;
};

const HR = 'Кадры и HR';
const WH = 'Склад';
const TAX = 'Налоги и бухгалтерия';
const OTH = 'Прочее';


function appBody(inner: string) {
  return inner.trim();
}

function memoBody(inner: string) {
  return inner.trim();
}


export const EDO_CATALOG: EdoCatalogItem[] = [

  {
    code: 'hr_resign',
    name: 'Заявление на увольнение',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 10,
    description: 'Ст. 80 ТК РФ. Заявление считается поданным после подписания. При сроке ≥14 дней — сразу на подпись; менее 14 — согласование даты с руководителем.',
    keywords: 'увольнение собственное желание кадры кэдо',
    fields: [
      { key: 'last_work_day', label: 'Дата последнего рабочего дня', type: 'date', required: true },
      { key: 'reason', label: 'Комментарий (по желанию)', type: 'textarea', placeholder: 'По собственному желанию' },
    ],
    title_template: 'Заявление на увольнение',
    body_template: appBody(
      `Прошу уволить меня по собственному желанию {{last_work_day}} в соответствии со статьёй 80 Трудового кодекса Российской Федерации.
{{reason}}`,
    ),
  },
  {
    code: 'hr_2ndfl',
    name: 'Справка 2-НДФЛ',
    category: 'tax', category_label: TAX, form_type: 'application', sort_order: 20,
    description: 'Заказ справки о доходах физического лица (2-НДФЛ).',
    keywords: '2-ндфл налог справка доходы бухгалтерия',
    fields: [
      { key: 'year', label: 'За какой год', type: 'number', required: true, placeholder: String(new Date().getFullYear() - 1) },
      { key: 'copies', label: 'Количество экземпляров', type: 'number', placeholder: '1' },
      { key: 'purpose', label: 'Цель получения', type: 'text', placeholder: 'Для банка / визы / …' },
    ],
    title_template: 'Заявление на выдачу справки 2-НДФЛ',
    body_template: appBody(
      `Прошу выдать справку о доходах физического лица (форма 2-НДФЛ) за {{year}} год.
Количество экземпляров: {{copies}}.
Цель: {{purpose}}.`,
    ),
  },
  {
    code: 'hr_income_cert',
    name: 'Справка с места работы',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 30,
    description: 'Справка с места работы с/без указания оклада (RU/EN). Срок обработки до 3 рабочих дней.',
    keywords: 'справка место работы оклад salary certificate',
    fields: [
      { key: 'with_salary', label: 'С указанием оклада', type: 'select', options: ['да', 'нет'], required: true },
      { key: 'lang', label: 'Язык', type: 'select', options: ['русский', 'английский'], required: true },
      { key: 'format', label: 'Формат выдачи', type: 'select', options: ['электронно (КЭДО)', 'печать'], required: true },
      { key: 'purpose', label: 'Цель', type: 'text' },
    ],
    title_template: 'Заявление на справку с места работы',
    body_template: appBody(
      `Прошу выдать справку с места работы.
С указанием заработной платы: {{with_salary}}.
Язык: {{lang}}.
Формат: {{format}}.
Цель: {{purpose}}.`,
    ),
  },
  {
    code: 'hr_personal_data',
    name: 'Изменение личных данных',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 40,
    description: 'Смена ФИО, паспорта, адреса и иных персональных данных в учёте.',
    keywords: 'личные данные паспорт фио адрес изменение',
    fields: [
      { key: 'what_changed', label: 'Что изменилось', type: 'textarea', required: true },
      { key: 'effective_date', label: 'Дата изменения', type: 'date', required: true },
    ],
    title_template: 'Заявление об изменении личных данных',
    body_template: appBody(
      `Прошу внести изменения в мои персональные данные в кадровом учёте с {{effective_date}}.

Изменения:
{{what_changed}}

Оригиналы подтверждающих документов предоставлю в отдел кадров.`,
    ),
  },
  {
    code: 'hr_bank_details',
    name: 'Изменение реквизитов для ЗП',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 50,
    description: 'Смена реквизитов для перечисления заработной платы.',
    keywords: 'зарплата реквизиты карта банк зарплатный проект',
    fields: [
      { key: 'bank_name', label: 'Банк', type: 'text', required: true },
      { key: 'account', label: 'Счёт / карта', type: 'text', required: true },
      { key: 'bik', label: 'БИК', type: 'text' },
      { key: 'from_date', label: 'Перечислять с даты', type: 'date', required: true },
    ],
    title_template: 'Заявление об изменении реквизитов для перечисления заработной платы',
    body_template: appBody(
      `Прошу перечислять заработную плату на следующие реквизиты с {{from_date}}:
Банк: {{bank_name}}
Счёт/карта: {{account}}
БИК: {{bik}}`,
    ),
  },
  {
    code: 'hr_salary_project',
    name: 'Зарплатный проект',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 55,
    description: 'Подключение / смена зарплатного проекта.',
    keywords: 'зарплатный проект банк карта',
    fields: [
      { key: 'action', label: 'Действие', type: 'select', options: ['подключить', 'сменить банк', 'отключить'], required: true },
      { key: 'bank_name', label: 'Банк', type: 'text', required: true },
      { key: 'comment', label: 'Комментарий', type: 'textarea' },
    ],
    title_template: 'Заявка по зарплатному проекту',
    body_template: appBody(`Действие: {{action}}.
Банк: {{bank_name}}.
{{comment}}`),
  },
  {
    code: 'hr_labor_copy',
    name: 'Копия трудовой книжки',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 60,
    description: 'При ЭТК копию можно скачать на Госуслугах. Здесь — запрос бумажной/заверенной копии.',
    keywords: 'трудовая книжка копия этк госуслуги',
    fields: [
      { key: 'copies', label: 'Количество заверенных копий', type: 'number', required: true, placeholder: '1' },
      { key: 'purpose', label: 'Цель', type: 'text' },
    ],
    title_template: 'Заявление о выдаче копии трудовой книжки',
    body_template: appBody(
      `Прошу выдать заверенную копию трудовой книжки в количестве {{copies}} экз.
Цель: {{purpose}}.`,
    ),
  },
  {
    code: 'hr_dms',
    name: 'Вопросы по ДМС',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 70,
    description: 'Вопросы по добровольному медицинскому страхованию.',
    keywords: 'дмс страхование медицина полис',
    fields: [
      { key: 'question', label: 'Вопрос / запрос', type: 'textarea', required: true },
    ],
    title_template: 'Обращение по ДМС',
    body_template: appBody(`Прошу рассмотреть обращение по ДМС:

{{question}}`),
  },
  {
    code: 'hr_insurance_change',
    name: 'Сменить страховую компанию',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 75,
    description: 'Заявка на смену страховой компании по ДМС.',
    keywords: 'страховая дмс смена',
    fields: [
      { key: 'current_insurer', label: 'Текущая СК', type: 'text' },
      { key: 'desired_insurer', label: 'Желаемая СК', type: 'text', required: true },
      { key: 'reason', label: 'Причина', type: 'textarea' },
    ],
    title_template: 'Заявка на смену страховой компании',
    body_template: appBody(
      `Прошу сменить страховую компанию.
Текущая: {{current_insurer}}
Желаемая: {{desired_insurer}}
Причина: {{reason}}`,
    ),
  },
  {
    code: 'hr_exec_docs',
    name: 'Исполнительные документы',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 80,
    description: 'Оформление и согласование удержаний из заработной платы по исполнительному листу (в т.ч. по инициативе сотрудника).',
    keywords: 'исполнительный лист удержание алименты',
    fields: [
      { key: 'action', label: 'Тип', type: 'select', options: ['заявление на удержание', 'отмена удержания', 'прочее'], required: true },
      { key: 'details', label: 'Реквизиты / описание', type: 'textarea', required: true },
    ],
    title_template: 'Заявка по исполнительным документам',
    body_template: appBody(`Тип обращения: {{action}}.

{{details}}`),
  },
  {
    code: 'hr_state_duty',
    name: 'Выполнение государственных обязанностей',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 90,
    description: 'Отсутствие: военкомат, сборы, суд (свидетель/присяжный), налоговая. Приложите повестки.',
    keywords: 'военкомат суд присяжный налоговая повестка гособязанности',
    fields: [
      { key: 'duty_type', label: 'Основание', type: 'select', required: true, options: [
        'мед. комиссия в военкомате', 'военные сборы', 'суд (свидетель)', 'суд (присяжный)',
        'вызов в военкомат', 'вызов в налоговую',
      ] },
      { key: 'date_from', label: 'С', type: 'date', required: true },
      { key: 'date_to', label: 'По', type: 'date', required: true },
      { key: 'doc_ref', label: 'Номер повестки / вызова', type: 'text', required: true },
    ],
    title_template: 'Заявка на выполнение государственных обязанностей',
    body_template: appBody(
      `Прошу оформить отсутствие в связи с выполнением государственных обязанностей.
Основание: {{duty_type}}.
Период: с {{date_from}} по {{date_to}}.
Документ-основание: {{doc_ref}}.
Подтверждающие документы прилагаю.`,
    ),
  },
  {
    code: 'hr_donor',
    name: 'Донорские дни',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 100,
    description: 'Дополнительный выходной за сдачу крови. Приложите справку о донации (рекомендуется с Госуслуг).',
    keywords: 'донор кровь донация выходной',
    fields: [
      { key: 'donation_date', label: 'Дата донации', type: 'date', required: true },
      { key: 'day_off', label: 'Желаемый день отдыха', type: 'date', required: true },
    ],
    title_template: 'Заявление на донорский день',
    body_template: appBody(
      `Прошу предоставить дополнительный день отдыха {{day_off}} за сдачу крови (компонентов крови) {{donation_date}} в соответствии со ст. 186 ТК РФ.
Справку о донации прилагаю; оригинал предоставлю в отдел кадров.`,
    ),
  },
  {
    code: 'hr_disabled_child',
    name: 'Доп. дни по уходу за ребёнком-инвалидом',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 110,
    description: 'Дополнительные оплачиваемые дни по уходу за ребёнком-инвалидом.',
    keywords: 'ребёнок инвалид дополнительные дни уход',
    fields: [
      { key: 'child_fio', label: 'ФИО ребёнка', type: 'text', required: true },
      { key: 'dates', label: 'Запрашиваемые даты', type: 'textarea', required: true },
    ],
    title_template: 'Заявление о предоставлении дополнительных дней по уходу за ребёнком-инвалидом',
    body_template: appBody(
      `Прошу предоставить дополнительные оплачиваемые дни по уходу за ребёнком-инвалидом {{child_fio}}.
Даты: {{dates}}.
Необходимые документы прилагаю.`,
    ),
  },
  {
    code: 'hr_mathelp_death',
    name: 'Материальная помощь (смерть родственника)',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 120,
    description: 'В течение 6 месяцев с даты смерти; на момент смерти — трудоустроен в компании.',
    keywords: 'материальная помощь смерть родственник',
    fields: [
      { key: 'relative', label: 'Кем приходится', type: 'text', required: true },
      { key: 'death_date', label: 'Дата смерти', type: 'date', required: true },
    ],
    title_template: 'Заявление о материальной помощи в связи со смертью близкого родственника',
    body_template: appBody(
      `Прошу оказать материальную помощь в связи со смертью {{relative}} (дата смерти {{death_date}}).
Копии подтверждающих документов прилагаю.`,
    ),
  },
  {
    code: 'hr_mathelp_birth',
    name: 'Материальная помощь (рождение ребёнка)',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 130,
    description: 'В течение 6 месяцев с даты рождения; на момент рождения — трудоустроен.',
    keywords: 'материальная помощь рождение ребёнок',
    fields: [
      { key: 'child_fio', label: 'ФИО ребёнка', type: 'text' },
      { key: 'birth_date', label: 'Дата рождения', type: 'date', required: true },
    ],
    title_template: 'Заявление о материальной помощи при рождении ребёнка',
    body_template: appBody(
      `Прошу оказать материальную помощь в связи с рождением ребёнка {{child_fio}} (дата рождения {{birth_date}}).
Копии документов прилагаю.`,
    ),
  },
  {
    code: 'hr_tax_child',
    name: 'Налоговый вычет на детей',
    category: 'tax', category_label: TAX, form_type: 'application', sort_order: 140,
    description: 'Стандартный налоговый вычет на детей.',
    keywords: 'вычет дети ндфл налог',
    fields: [
      { key: 'children', label: 'Сведения о детях', type: 'textarea', required: true, placeholder: 'ФИО, дата рождения' },
      { key: 'from_month', label: 'С какого месяца', type: 'text', required: true },
    ],
    title_template: 'Заявление о предоставлении налогового вычета на детей',
    body_template: appBody(
      `Прошу предоставить стандартный налоговый вычет на детей с {{from_month}}.
Сведения о детях:
{{children}}`,
    ),
  },
  {
    code: 'hr_tax_property',
    name: 'Налоговый вычет на имущество',
    category: 'tax', category_label: TAX, form_type: 'application', sort_order: 150,
    description: 'Имущественный налоговый вычет.',
    keywords: 'вычет имущество квартира ндфл',
    fields: [
      { key: 'object', label: 'Объект', type: 'text', required: true },
      { key: 'details', label: 'Реквизиты / сумма', type: 'textarea', required: true },
    ],
    title_template: 'Заявление о предоставлении имущественного налогового вычета',
    body_template: appBody(
      `Прошу предоставить имущественный налоговый вычет.
Объект: {{object}}
{{details}}`,
    ),
  },
  {
    code: 'hr_tax_other',
    name: 'Прочие налоговые вычеты',
    category: 'tax', category_label: TAX, form_type: 'application', sort_order: 160,
    description: 'Иные налоговые вычеты.',
    keywords: 'вычет налог прочее',
    fields: [
      { key: 'details', label: 'Описание', type: 'textarea', required: true },
    ],
    title_template: 'Заявление о налоговом вычете',
    body_template: appBody(`Прошу рассмотреть заявление о налоговом вычете:

{{details}}`),
  },
  {
    code: 'hr_accident',
    name: 'Несчастный случай',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 170,
    description: 'Сообщение / обращение по несчастному случаю.',
    keywords: 'несчастный случай травма охрана труда',
    fields: [
      { key: 'event_date', label: 'Дата события', type: 'date', required: true },
      { key: 'place', label: 'Место', type: 'text', required: true },
      { key: 'description', label: 'Описание', type: 'textarea', required: true },
    ],
    title_template: 'Сообщение о несчастном случае',
    body_template: appBody(
      `Сообщаю о несчастном случае {{event_date}} по адресу/месту: {{place}}.

{{description}}`,
    ),
  },
  {
    code: 'hr_maternity',
    name: 'Отпуск (больничный) по беременности и родам',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 180,
    description: 'Нужны номер больничного и реквизиты карты МИР (проверьте срок действия).',
    keywords: 'декрет беременность больничный bip мир',
    fields: [
      { key: 'sick_no', label: 'Номер больничного', type: 'text', required: true },
      { key: 'date_from', label: 'С', type: 'date', required: true },
      { key: 'date_to', label: 'По', type: 'date', required: true },
      { key: 'mir_card', label: 'Реквизиты карты МИР', type: 'text', required: true },
    ],
    title_template: 'Заявление на отпуск по беременности и родам',
    body_template: appBody(
      `Прошу предоставить отпуск по беременности и родам с {{date_from}} по {{date_to}}.
Номер листка нетрудоспособности: {{sick_no}}.
Реквизиты карты «МИР»: {{mir_card}}.`,
    ),
  },
  {
    code: 'hr_childcare',
    name: 'Отпуск по уходу за ребёнком',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 190,
    description: 'Оформление отпуска по уходу за ребёнком. Перечень документов — в заявке.',
    keywords: 'отпуск уход ребёнок декрет',
    fields: [
      { key: 'child_fio', label: 'ФИО ребёнка', type: 'text', required: true },
      { key: 'birth_date', label: 'Дата рождения', type: 'date', required: true },
      { key: 'date_from', label: 'Начало отпуска', type: 'date', required: true },
      { key: 'until', label: 'До достижения возраста', type: 'select', options: ['1,5 лет', '3 лет'], required: true },
    ],
    title_template: 'Заявление на отпуск по уходу за ребёнком',
    body_template: appBody(
      `Прошу предоставить отпуск по уходу за ребёнком {{child_fio}} (дата рождения {{birth_date}})
с {{date_from}} до достижения возраста {{until}}.
Необходимые документы прилагаю.`,
    ),
  },
  {
    code: 'hr_study_leave',
    name: 'Учебный отпуск',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 200,
    description: 'Приложите справку-вызов, лицензию и аккредитацию вуза. Оригинал справки-вызова — в ОК.',
    keywords: 'учебный отпуск справка-вызов вуз сессия',
    fields: [
      { key: 'institution', label: 'Учебное заведение', type: 'text', required: true },
      { key: 'date_from', label: 'С', type: 'date', required: true },
      { key: 'date_to', label: 'По', type: 'date', required: true },
      { key: 'call_no', label: 'Номер справки-вызова', type: 'text', required: true },
    ],
    title_template: 'Заявление на учебный отпуск',
    body_template: appBody(
      `Прошу предоставить учебный отпуск с {{date_from}} по {{date_to}}
в связи с обучением в {{institution}}.
Справка-вызов № {{call_no}}. Оригинал и копии лицензии/аккредитации прилагаю.`,
    ),
  },
  {
    code: 'hr_child_benefits',
    name: 'Льготы для детей',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 210,
    description: 'Обращение по льготам для детей сотрудников.',
    keywords: 'льготы дети',
    fields: [{ key: 'details', label: 'Описание', type: 'textarea', required: true }],
    title_template: 'Заявка по льготам для детей',
    body_template: appBody(`Прошу рассмотреть обращение по льготам для детей:

{{details}}`),
  },
  {
    code: 'hr_kz_arrival',
    name: 'Уведомление о прибытии в Казахстан',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 220,
    description: 'Для граждан с РВП — уведомление после пересечения границы.',
    keywords: 'казахстан рвп прибытие уведомление',
    fields: [
      { key: 'arrival_date', label: 'Дата прибытия', type: 'date', required: true },
      { key: 'place', label: 'Пункт / город', type: 'text', required: true },
    ],
    title_template: 'Уведомление о прибытии в Казахстан',
    body_template: appBody(
      `Уведомляю о прибытии в Казахстан {{arrival_date}} ({{place}}) в соответствии с требованиями по РВП.`,
    ),
  },
  {
    code: 'hr_cert_other_acc',
    name: 'Другой вид справок (бухгалтерия)',
    category: 'tax', category_label: TAX, form_type: 'application', sort_order: 230,
    description: 'Если нужной справки нет в списке — опишите запрос.',
    keywords: 'справка бухгалтерия прочее',
    fields: [{ key: 'details', label: 'Какая справка нужна', type: 'textarea', required: true }],
    title_template: 'Запрос справки (бухгалтерия)',
    body_template: appBody(`Прошу подготовить справку:

{{details}}`),
  },
  {
    code: 'hr_cert_other_hr',
    name: 'Другой вид справок (кадры)',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 240,
    description: 'Если нужной кадровой справки нет в списке.',
    keywords: 'справка кадры прочее',
    fields: [{ key: 'details', label: 'Какая справка нужна', type: 'textarea', required: true }],
    title_template: 'Запрос справки (кадры)',
    body_template: appBody(`Прошу подготовить справку:

{{details}}`),
  },
  {
    code: 'hr_other',
    name: 'Прочие вопросы',
    category: 'other', category_label: OTH, form_type: 'application', sort_order: 250,
    description: 'Общее обращение.',
    keywords: 'прочее вопрос обращение',
    fields: [
      { key: 'subject', label: 'Тема', type: 'text', required: true },
      { key: 'details', label: 'Текст', type: 'textarea', required: true },
    ],
    title_template: 'Обращение: {{subject}}',
    body_template: appBody(`Тема: {{subject}}

{{details}}`),
  },
  {
    code: 'hr_sport',
    name: 'Спорт',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 260,
    description: 'Обращение по корпоративному спорту / компенсациям.',
    keywords: 'спорт фитнес компенсация',
    fields: [{ key: 'details', label: 'Запрос', type: 'textarea', required: true }],
    title_template: 'Заявка: спорт',
    body_template: appBody(`{{details}}`),
  },
  {
    code: 'hr_discounts',
    name: 'Скидки / скидочный сервис',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 270,
    description: 'Корпоративные скидки и сервисы.',
    keywords: 'скидки сервис понимать',
    fields: [{ key: 'details', label: 'Запрос', type: 'textarea', required: true }],
    title_template: 'Заявка: скидки',
    body_template: appBody(`{{details}}`),
  },
  {
    code: 'hr_ponimayu',
    name: 'Сервис ПОНИМАЮ',
    category: 'hr', category_label: HR, form_type: 'application', sort_order: 280,
    description: 'Обращение в сервис поддержки сотрудников.',
    keywords: 'понимаю поддержка',
    fields: [{ key: 'details', label: 'Вопрос', type: 'textarea', required: true }],
    title_template: 'Обращение в сервис ПОНИМАЮ',
    body_template: appBody(`{{details}}`),
  },


  {
    code: 'wh_inv_shortage',
    name: 'Служебная записка по результатам инвентаризации',
    category: 'warehouse', category_label: WH, form_type: 'service_note', sort_order: 300,
    description: 'Доклад руководителю о недостаче/излишках по итогам инвентаризации (свободная форма, практика РФ).',
    keywords: 'инвентаризация недостача излишки ревизия склад служебная',
    fields: [
      { key: 'inv_date', label: 'Дата инвентаризации', type: 'date', required: true },
      { key: 'location', label: 'Склад / зона', type: 'text', required: true },
      { key: 'result_type', label: 'Результат', type: 'select', options: ['недостача', 'излишки', 'недостача и излишки', 'без расхождений'], required: true },
      { key: 'details', label: 'Перечень / суммы', type: 'textarea', required: true },
      { key: 'proposal', label: 'Предложение', type: 'textarea', placeholder: 'запросить объяснительную МОЛ / списать / …' },
    ],
    title_template: 'Служебная записка по результатам инвентаризации',
    body_template: memoBody(
      `В период инвентаризации {{inv_date}} на складе (зоне) «{{location}}» выявлено: {{result_type}}.

{{details}}

Предложение: {{proposal}}
Прошу рассмотреть и дать указания.`,
    ),
  },
  {
    code: 'wh_tmc_missing',
    name: 'Служебная записка об отсутствии ТМЦ на складе',
    category: 'warehouse', category_label: WH, form_type: 'service_note', sort_order: 310,
    description: 'Фиксация обнаруженного отсутствия ТМЦ (в т.ч. вне плановой инвентаризации).',
    keywords: 'тмц отсутствие пропажа склад',
    fields: [
      { key: 'found_date', label: 'Дата обнаружения', type: 'date', required: true },
      { key: 'location', label: 'Место хранения', type: 'text', required: true },
      { key: 'items', label: 'Номенклатура (наименование, кол-во)', type: 'textarea', required: true },
    ],
    title_template: 'Служебная записка об обнаружении отсутствия ТМЦ',
    body_template: memoBody(
      `Довожу до сведения, что {{found_date}} по месту хранения «{{location}}» обнаружено отсутствие товарно-материальных ценностей:

{{items}}

Прошу назначить служебное разбирательство.`,
    ),
  },
  {
    code: 'wh_writeoff_request',
    name: 'Заявка на списание ТМЦ',
    category: 'warehouse', category_label: WH, form_type: 'application', sort_order: 320,
    description: 'Основание для акта списания: износ, порча, срок годности, бой и т.п.',
    keywords: 'списание тмц акт износ порча срок',
    fields: [
      { key: 'reason', label: 'Причина списания', type: 'select', required: true, options: [
        'физический износ', 'истечение срока годности', 'порча / бой / лом', 'недостача', 'прочее',
      ] },
      { key: 'items', label: 'Перечень ТМЦ', type: 'textarea', required: true },
      { key: 'attachments', label: 'Приложения', type: 'text', placeholder: 'дефектная ведомость, фото, …' },
    ],
    title_template: 'Заявка на списание ТМЦ',
    body_template: appBody(
      `Прошу разрешить списание товарно-материальных ценностей.
Причина: {{reason}}.

Перечень:
{{items}}

Приложения: {{attachments}}.`,
    ),
  },
  {
    code: 'wh_explain_shortage',
    name: 'Объяснительная по недостаче',
    category: 'warehouse', category_label: WH, form_type: 'application', sort_order: 330,
    description: 'Объяснение материально ответственного лица по недостаче.',
    keywords: 'объяснительная недостача мол',
    fields: [
      { key: 'inv_date', label: 'Дата инвентаризации / факт', type: 'date', required: true },
      { key: 'items', label: 'По каким позициям', type: 'textarea', required: true },
      { key: 'explanation', label: 'Объяснение', type: 'textarea', required: true },
    ],
    title_template: 'Объяснительная записка по недостаче',
    body_template: appBody(
      `По факту недостачи, выявленной {{inv_date}}, сообщаю следующее.

Позиции:
{{items}}

Объяснение:
{{explanation}}`,
    ),
  },
  {
    code: 'wh_move_request',
    name: 'Заявка на перемещение ТМЦ',
    category: 'warehouse', category_label: WH, form_type: 'service_note', sort_order: 340,
    description: 'Внутреннее перемещение между складами / ячейками.',
    keywords: 'перемещение склад ячейка тмц',
    fields: [
      { key: 'from_loc', label: 'Откуда', type: 'text', required: true },
      { key: 'to_loc', label: 'Куда', type: 'text', required: true },
      { key: 'items', label: 'Номенклатура и количество', type: 'textarea', required: true },
      { key: 'need_date', label: 'Желаемая дата', type: 'date' },
    ],
    title_template: 'Заявка на перемещение ТМЦ',
    body_template: memoBody(
      `Прошу оформить перемещение ТМЦ:
Откуда: {{from_loc}}
Куда: {{to_loc}}
Желаемая дата: {{need_date}}

{{items}}`,
    ),
  },
  {
    code: 'wh_receive_claim',
    name: 'Акт / претензия при приёмке',
    category: 'warehouse', category_label: WH, form_type: 'act', sort_order: 350,
    description: 'Расхождение при приёмке поставки (количество, качество, повреждения).',
    keywords: 'приёмка претензия поставка брак недостача',
    fields: [
      { key: 'po_ref', label: 'Заказ / накладная', type: 'text', required: true },
      { key: 'supplier', label: 'Поставщик', type: 'text', required: true },
      { key: 'issue', label: 'Суть расхождения', type: 'textarea', required: true },
    ],
    title_template: 'Акт о расхождениях при приёмке · {{date}}',
    body_template:
`Организация: {{org}}
Дата: {{date}}
Документ поставки: {{po_ref}}
Поставщик: {{supplier}}

Мы, нижеподписавшиеся, составили настоящий акт о том, что при приёмке ТМЦ выявлены расхождения:

{{issue}}

От склада: _______________ / {{from_employee}} /
Получатель уведомления: _______________ / {{to_employee}} /`,
  },
  {
    code: 'wh_mol_assign',
    name: 'Заявка на закрепление МОЛ',
    category: 'warehouse', category_label: WH, form_type: 'service_note', sort_order: 360,
    description: 'Назначение / смена материально ответственного лица по складу.',
    keywords: 'мол материально ответственный склад',
    fields: [
      { key: 'location', label: 'Склад / зона', type: 'text', required: true },
      { key: 'mol_name', label: 'ФИО МОЛ', type: 'text', required: true },
      { key: 'from_date', label: 'С даты', type: 'date', required: true },
    ],
    title_template: 'Служебная записка о закреплении МОЛ',
    body_template: memoBody(
      `Прошу закрепить материально ответственным лицом по «{{location}}» сотрудника {{mol_name}} с {{from_date}}.
Договор о полной материальной ответственности оформить в установленном порядке.`,
    ),
  },
];

export function listEdoCatalog(filters: { q?: string; category?: string } = {}) {

  const { resolveEdoIdentity, EDO_CATEGORY_META } = require('./edoTags') as typeof import('./edoTags');
  let rows = EDO_CATALOG.slice();
  if (filters.category) {
    rows = rows.filter((r) => r.category === filters.category);
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    rows = rows.filter((r) => {
      const hay = `${r.name} ${r.description} ${r.keywords} ${r.code} ${r.category_label}`.toLowerCase();
      return hay.includes(q);
    });
  }
  return rows
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'ru'))
    .map((item) => {
      const id = resolveEdoIdentity({ form_type: item.form_type, catalog_code: item.code, title: item.name });
      return {
        ...item,
        doc_tag: id.doc_tag,
        reg_stream: id.reg_stream,
        category_tag: EDO_CATEGORY_META[item.category]?.tag || item.category_label,
        theme_index: id.theme_index,
        form_tag: id.form_tag,
        tags: id.tags,
      };
    });
}

export function getEdoCatalogItem(code: string) {
  return EDO_CATALOG.find((r) => r.code === code) || null;
}

export function applyCatalogTemplate(
  code: string,
  vars: Record<string, string | number | null | undefined> = {},
) {
  const item = getEdoCatalogItem(code);
  if (!item) throw new Error('Форма не найдена в каталоге');
  const map: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) map[k] = v == null ? '' : String(v);
  if (map.from_position) map.from_position_line = `\nДолжность: ${map.from_position}`;
  else map.from_position_line = '';
  if (map.to_position) map.to_position_line = `\nДолжность: ${map.to_position}`;
  else map.to_position_line = '';
  const replace = (text: string) => String(text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => map[key] ?? '');
  return {
    code: item.code,
    form_type: item.form_type,
    title: replace(item.title_template),
    body: replace(item.body_template),
    name: item.name,
    fields: item.fields,
    description: item.description,
  };
}
