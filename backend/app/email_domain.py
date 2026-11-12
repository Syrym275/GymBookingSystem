"""Checks that an email's domain can receive mail, using DNS.

This catches typos and made-up domains (user@gmial.com, user@nosuchsite.kz).
It cannot tell whether the mailbox itself exists; the emailed code proves that.
"""

import logging
from functools import lru_cache

import dns.exception
import dns.resolver


logger = logging.getLogger(__name__)

DNS_TIMEOUT_SECONDS = 4


@lru_cache(maxsize=1024)
def domain_accepts_mail(domain: str) -> bool | None:
    """True if the domain can receive mail, False if it cannot, None if DNS did not answer."""
    resolver = dns.resolver.Resolver()
    resolver.lifetime = DNS_TIMEOUT_SECONDS

    try:
        answer = resolver.resolve(domain, "MX")
        # A single "0 ." record (RFC 7505) means the domain explicitly accepts no mail.
        return any(str(record.exchange) != "." for record in answer)
    except dns.resolver.NXDOMAIN:
        return False  # the domain does not exist
    except dns.resolver.NoAnswer:
        pass  # the domain exists but has no MX record; mail then goes to its address
    except dns.exception.DNSException:
        logger.warning("DNS lookup for %s failed; allowing the sign-up", domain)
        return None

    for record_type in ("A", "AAAA"):
        try:
            resolver.resolve(domain, record_type)
            return True
        except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
            continue
        except dns.exception.DNSException:
            logger.warning("DNS lookup for %s failed; allowing the sign-up", domain)
            return None
    return False


def email_domain_exists(email: str) -> bool:
    """False only when DNS clearly says the domain cannot get mail.

    A DNS outage must not block every sign-up, so an unanswered lookup counts as OK;
    the confirmation code still stops addresses that do not really work.
    """
    return domain_accepts_mail(email.rsplit("@", 1)[1]) is not False
