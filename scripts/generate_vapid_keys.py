#!/usr/bin/env python3
"""Generate a VAPID keypair for Web Push notifications.

Uses SECP256R1 (P-256) elliptic curve cryptography.
Outputs url-safe unpadded base64 strings ready for backend/.env.
"""
import base64
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

b64u = lambda b: base64.urlsafe_b64encode(b).decode().rstrip("=")
k = ec.generate_private_key(ec.SECP256R1())
private = b64u(k.private_numbers().private_value.to_bytes(32, "big"))
public = b64u(k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))

print("VAPID_PUBLIC_KEY=" + public)
print("VAPID_PRIVATE_KEY=" + private)
