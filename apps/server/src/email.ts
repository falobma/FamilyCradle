import nodemailer from "nodemailer";
import type { Environment } from "./config.js";

export function createEmailTransport(environment: Environment) {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: environment.SMTP_USER,
      pass: environment.SMTP_APP_PASSWORD,
    },
  });
}
