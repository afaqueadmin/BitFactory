import nodemailer from "nodemailer";

// Create a transporter using SMTP
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE,
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

export const sendWelcomeEmail = async (email: string, tempPassword: string) => {
  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: email,
    subject: "Welcome to BitFactory - Your Account Details",
    html: `
      <h1>Welcome to BitFactory!</h1>
      <p>Your account has been created successfully. Here are your login credentials:</p>
      <p><strong>URL:</strong><a href="my.bitfactory.ae" target="_blank"> my.bitfactory.ae</a></p>
      <p><strong>Username:</strong> ${email}</p>
      <p><strong>Temporary Password:</strong> ${tempPassword}</p>
      <p>For security reasons, please change your password immediately after logging in.</p>
      <p>If you have any questions, please don't hesitate to contact our support team.</p>
      <br>
      <p>Best regards,</p>
      <p>The BitFactory Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return { success: false, error };
  }
};

export const sendPasswordResetEmail = async (
  email: string,
  tempPassword: string,
) => {
  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: email,
    subject: "Password Reset Request - BitFactory",
    html: `
      <h1>Password Reset</h1>
      <p>Your password has been reset successfully. Here are your updated login credentials:</p>
      <p><strong>URL:</strong><a href="https://my.bitfactory.ae" target="_blank"> my.bitfactory.ae</a></p>
      <p><strong>Username:</strong> ${email}</p>
      <p><strong>Temporary Password:</strong> ${tempPassword}</p>
      <p>For security reasons, please change your password immediately after logging in.</p>
      <p>If you did not request this password reset, please contact our support team immediately.</p>
      <br>
      <p>Best regards,</p>
      <p>The BitFactory Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return { success: false, error };
  }
};

export const sendInvoiceEmail = async (
  email: string,
  customerName: string,
  invoiceNumber: string,
  totalAmount: number,
  dueDate: Date,
  issuedDate: Date,
) => {
  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: email,
    subject: `Invoice ${invoiceNumber} from BitFactory`,
    html: `
      <h1>Invoice Notification</h1>
      <p>Dear ${customerName},</p>
      <p>Your invoice from BitFactory is now ready. Please find the details below:</p>
      <br>
      <table style="width: 100%; border-collapse: collapse;">
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Invoice Number</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Amount</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">$${totalAmount.toFixed(2)}</td>
        </tr>
        <tr style="background-color: #f5f5f5;">
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Issued Date</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${formatDate(issuedDate)}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Due Date</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${formatDate(dueDate)}</td>
        </tr>
      </table>
      <br>
      <p>Please log in to your BitFactory account to view the complete invoice details.</p>
      <p><strong>Login URL:</strong> <a href="https://my.bitfactory.ae" target="_blank">my.bitfactory.ae</a></p>
      <br>
      <p>If you have any questions about this invoice, please contact our support team.</p>
      <br>
      <p>Best regards,</p>
      <p>The BitFactory Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending invoice email:", error);
    return { success: false, error };
  }
};

export const sendCronRunSuccessfulEmail = async (userCount: number) => {
  const date = new Date();
  const mailOptions = {
    from:
      `BitFactory Admin <${process.env.SMTP_FROM}>` || "noreply@bitfactory.com",
    to: process.env.SMTP_USER,
    subject: "Cron run successfully - BitFactory",
    html: `
      <h1>Cron</h1>
      <p>Cost deduction cron run successfully for ${userCount} users.</p>
      <p>Cron ran at ${date}.</p>
      <br>
      <p>Best regards,</p>
      <p>The BitFactory Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true };
  } catch (error) {
    console.error("Error sending cron success email:", error);
    return { success: false, error };
  }
};
