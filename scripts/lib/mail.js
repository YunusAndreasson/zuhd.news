// Mail from the server: the cycle's alerts. SMTP, by default Gmail with an
// app password (Google account → Security → App passwords).
import nodemailer from 'nodemailer'

/** Where alerts go when `ALERT_EMAIL_TO` does not say. */
export const ALERT_TO = 'support@zuhd.news'

/**
 * @typedef {object} MailConfig
 * @property {string} host
 * @property {number} port
 * @property {string} user
 * @property {string} pass
 * @property {string} to
 * @property {string} from
 */

/**
 * How to send, from the environment; null when no account is set.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {MailConfig | null}
 */
export function mailConfig(env = process.env) {
  const user = env.SMTP_USER?.trim()
  // Google shows an app password in four groups of four; the spaces are not part of it.
  const pass = env.SMTP_PASS?.replace(/\s+/g, '')
  if (!user || !pass) return null
  return {
    host: env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(env.SMTP_PORT || 465),
    user,
    pass,
    to: env.ALERT_EMAIL_TO || ALERT_TO,
    from: env.ALERT_EMAIL_FROM || `zuhd.news cycle <${user}>`,
  }
}

/**
 * Send one mail; resolves to the server's message id. The deadlines keep it
 * inside the unit's stop timeout.
 *
 * @param {MailConfig} config
 * @param {{ subject: string, text: string }} mail
 */
export async function sendMail(config, { subject, text }) {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  })
  const info = await transport.sendMail({ from: config.from, to: config.to, subject, text })
  return /** @type {string} */ (info.messageId)
}
