import ipaddress
import socket
from collections.abc import Callable, Sequence
from urllib.parse import urlsplit, urlunsplit


Resolver = Callable[..., Sequence[tuple[object, ...]]]


def resolve_public_ip(hostname: str, port: int, *, resolver: Resolver = socket.getaddrinfo) -> str:
    try:
        literal = ipaddress.ip_address(hostname)
    except ValueError:
        try:
            addresses = resolver(hostname, port, type=socket.SOCK_STREAM)
        except OSError:
            raise ValueError("Provider endpoint DNS resolution failed") from None
        if not addresses:
            raise ValueError("Provider endpoint DNS resolution returned no addresses")
        resolved = [str(entry[4][0]) for entry in addresses]
    else:
        resolved = [str(literal)]
    parsed = [ipaddress.ip_address(address.split("%", 1)[0]) for address in resolved]
    if any(not address.is_global for address in parsed):
        raise ValueError("Provider endpoint resolves to a non-public address")
    return str(parsed[0])


def validate_https_base_url(base_url: str, *, resolver: Resolver = socket.getaddrinfo) -> str:
    parsed = urlsplit(base_url)
    if (
        parsed.scheme.lower() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("Provider endpoint must be a safe HTTPS base URL")
    hostname = parsed.hostname.rstrip(".").lower()
    if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".localhost"):
        raise ValueError("Provider endpoint resolves to a non-public address")
    port = parsed.port or 443
    resolve_public_ip(hostname, port, resolver=resolver)
    try:
        ipaddress.ip_address(hostname)
        netloc_host = f"[{hostname}]" if ":" in hostname else hostname
    except ValueError:
        netloc_host = hostname.encode("idna").decode("ascii")
    netloc = netloc_host if port == 443 else f"{netloc_host}:{port}"
    path = parsed.path.rstrip("/")
    return urlunsplit(("https", netloc, path, "", ""))
