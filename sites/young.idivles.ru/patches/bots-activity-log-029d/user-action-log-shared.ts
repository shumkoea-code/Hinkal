/** Client-safe labels/types for user activity log (no next/headers). */

export type UserActionCategory =
  | 'auth'
  | 'profile'
  | 'booking'
  | 'application'
  | 'social'
  | 'eco'
  | 'content'
  | 'security'
  | 'consent'
  | 'bots'
  | 'admin'
  | 'other';

export const ACTION_LABELS_RU: Record<string, string> = {
  LOGIN: 'Вход',
  LOGOUT: 'Выход',
  REGISTER: 'Регистрация',
  PROFILE_UPDATE: 'Обновление профиля',
  PROFILE_AVATAR: 'Смена аватара',
  SHOWCASE_BADGES: 'Значки профиля',
  MESSENGER_IDS: 'ID мессенджеров',
  BOOKING_CREATE: 'Создание брони',
  BOOKING_CANCEL: 'Отмена брони',
  BOOKING_JOIN: 'Участие в мероприятии',
  BOOKING_LEAVE: 'Отказ от участия',
  APPLICATION_CREATE: 'Подача заявки',
  APPLICATION_CANCEL: 'Отзыв заявки',
  ECO_SPEND: 'Покупка в эко-магазине',
  ECO_GRANT: 'Начисление эко-баллов',
  CONSENT_COOKIES: 'Согласие cookie',
  CONSENT_PRIVACY: 'Согласие с политикой',
  DEVICE_TRUST: 'Доверенное устройство',
  DEVICE_REVOKE: 'Отзыв устройства',
  PASSWORD_CHANGE: 'Смена пароля',
  FRIEND_REQUEST: 'Заявка в друзья',
  MESSAGE_SEND: 'Сообщение',
  BOTS_SAVE: 'Настройки ботов',
  BOTS_TEST: 'Тест бота',
  BOTS_WEBHOOK: 'Вебхук бота',
};

export const CATEGORY_LABELS_RU: Record<UserActionCategory, string> = {
  auth: 'Вход',
  profile: 'Профиль',
  booking: 'Брони / билеты',
  application: 'Заявки',
  social: 'Общение',
  eco: 'Эко-баллы',
  content: 'Контент',
  security: 'Безопасность',
  consent: 'Согласия',
  bots: 'Боты',
  admin: 'Админка',
  other: 'Прочее',
};
