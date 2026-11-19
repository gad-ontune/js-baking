"""SMTP email delivery for security verification and recovery messages.

Tokens are only ever passed in memory to this module. They are never logged;
when SMTP is not configured, delivery is skipped and the caller shows the token
once in the development UI instead.
"""

import logging
import smtplib
from email.message import EmailMessage
from urllib.parse import urlencode

from .config import settings

logger = logging.getLogger('jsbh.email')

PRODUCT_NAME = 'JS Baking House'


def email_configured() -> bool:
    return bool(settings.smtp_host and settings.smtp_from)


def _app_url(path: str, token: str) -> str:
    query = urlencode({'token': token})
    return f"{settings.frontend_url.rstrip('/')}{path}?{query}"


def _send(to: str, subject: str, body: str) -> bool:
    if not email_configured():
        logger.info('Email delivery is not configured; security code withheld from email.')
        return False

    message = EmailMessage()
    message['From'] = settings.smtp_from
    message['To'] = to
    message['Subject'] = f'{PRODUCT_NAME}: {subject}'
    message.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=settings.smtp_timeout_seconds) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as exc:
        # Log only the exception type/message, never tokens or credentials.
        logger.warning('Security email could not be delivered: %s', type(exc).__name__)
        return False
    return True


def send_password_reset(to: str, token: str, *, owner_initiated: bool) -> bool:
    url = _app_url('/reset-password', token)
    recipient = 'your staff account' if owner_initiated else 'your owner account'
    body = (
        f'Hello,\n\n'
        f'A password reset was requested for {recipient} on {PRODUCT_NAME}.\n\n'
        f'Use this one-time code: {token}\n'
        f'Or open this link: {url}\n\n'
        f'The code expires in {settings.reset_token_minutes} minutes and can be used once. '
        f'If you did not expect this, ignore this message and contact the owner.\n\n'
        f'Never share this code or password with anyone.\n'
    )
    return _send(to, 'Password reset code', body)


def send_email_verification(to: str, token: str) -> bool:
    url = _app_url('/verify-email', token)
    body = (
        f'Hello,\n\n'
        f'Verify the email address on your {PRODUCT_NAME} account.\n\n'
        f'Use this one-time code: {token}\n'
        f'Or open this link: {url}\n\n'
        f'The code expires in {settings.email_verification_token_minutes} minutes.\n'
        f'If you did not request this, you can safely ignore this message.\n'
    )
    return _send(to, 'Verify your email address', body)


def send_security_alert(to: str, subject: str, lines: list[str]) -> bool:
    """Send a plain-text security alert containing no tokens or credentials."""
    body = (
        f'{PRODUCT_NAME} security alert\n\n'
        + '\n'.join(f'- {line}' for line in lines)
        + '\n\nReview the audit log in the application for full context.\n'
    )
    return _send(to, subject, body)
