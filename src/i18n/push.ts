/**
 * Texts of the push notifications (part of `de` as `de.push`). A file of its own: the service
 * worker bundles only these. Always general – the server knows no personal data.
 */
export const pushTexts = {
  reminders: {
    morning: { title: 'Dein Tag', body: 'Termine, Mails und fällige Aufgaben im Überblick.' },
    dayReview: {
      title: 'Zeit für deinen Tages-Review',
      body: 'Was lief gut, was nicht – und was machst du morgen besser?',
    },
    weekReview: {
      title: 'Wochen-Review',
      body: 'Muster, Bremsen und drei Änderungen für die neue Woche.',
    },
    test: { title: 'Cockpit', body: 'Probe: Deine Mitteilungen kommen an.' },
  },
  fallback: { title: 'Cockpit', body: 'Tippe, um Cockpit zu öffnen.' },
} as const;
