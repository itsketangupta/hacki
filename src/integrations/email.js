import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter;

export function isEmailConfigured() {
  return Boolean(config.smtpUrl && config.mailFrom);
}

export async function sendEmail({ to, subject, text }) {
  if (!isEmailConfigured()) throw new Error('Email is not configured. Add SMTP_URL and MAIL_FROM to the server environment.');
  if (!transporter) transporter = nodemailer.createTransport(config.smtpUrl);
  return transporter.sendMail({ from: config.mailFrom, to, subject, text });
}
