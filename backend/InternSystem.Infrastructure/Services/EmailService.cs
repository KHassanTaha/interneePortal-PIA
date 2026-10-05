using System.Net;
using System.Net.Mail;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace InternSystem.Infrastructure.Services;

public class SmtpSettings
{
    public string Host { get; set; } = string.Empty;
    public int Port { get; set; } = 587;
    public string SenderEmail { get; set; } = string.Empty;
    public string SenderName { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class EmailService
{
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IConfiguration config, ILogger<EmailService> logger)
    {
        _config = config;
        _logger = logger;
    }

    // Graceful: when SMTP is not configured (or mail is rejected), log and return
    // without throwing so caller-facing flows (e.g. intern creation) still succeed.
    public async Task SendAsync(string to, string subject, string body)
    {
        var smtp = _config.GetSection("Smtp").Get<SmtpSettings>();
        if (smtp == null || string.IsNullOrWhiteSpace(smtp.Host) || string.IsNullOrWhiteSpace(smtp.SenderEmail) || string.IsNullOrWhiteSpace(smtp.Password))
        {
            _logger.LogWarning("Smtp not configured; skipping email to {To} (subject: {Subject})", to, subject);
            return;
        }

        try
        {
            var password = smtp.Password.Replace(" ", "");
            using var client = new SmtpClient(smtp.Host, smtp.Port)
            {
                EnableSsl = true,
                UseDefaultCredentials = false,
                Credentials = new NetworkCredential(smtp.SenderEmail, password),
                Timeout = 15000,
                DeliveryMethod = SmtpDeliveryMethod.Network
            };

            using var message = new MailMessage
            {
                From = new MailAddress(smtp.SenderEmail, string.IsNullOrWhiteSpace(smtp.SenderName) ? "PIA Internship" : smtp.SenderName),
                Subject = subject,
                Body = body,
                IsBodyHtml = true
            };
            message.To.Add(to);

            await client.SendMailAsync(message);
            _logger.LogInformation("Email sent to {To}", to);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Email to {To} failed", to);
        }
    }
}