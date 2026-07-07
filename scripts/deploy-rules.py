#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Despliega firestore.rules al proyecto valtia-analytics via REST
(sin necesidad de Node/firebase-tools). Autorizado por Lauti 07/07/2026.
Uso: python scripts/deploy-rules.py
Requiere: pip install google-auth requests · serviceAccountKey.json en la raiz.
"""
import json, os, sys
import requests
from google.oauth2 import service_account
from google.auth.transport.requests import Request as GARequest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT = "valtia-analytics"

creds = service_account.Credentials.from_service_account_file(
    os.path.join(ROOT, "serviceAccountKey.json"),
    scopes=["https://www.googleapis.com/auth/cloud-platform"])
creds.refresh(GARequest())
H = {"Authorization": f"Bearer {creds.token}", "Content-Type": "application/json"}

source = open(os.path.join(ROOT, "firestore.rules"), encoding="utf-8").read()

# 1. Crear ruleset con el contenido de firestore.rules
r = requests.post(
    f"https://firebaserules.googleapis.com/v1/projects/{PROJECT}/rulesets",
    headers=H, timeout=30,
    data=json.dumps({"source": {"files": [
        {"name": "firestore.rules", "content": source}]}}))
if r.status_code != 200:
    sys.exit(f"[ERROR] creando ruleset: {r.status_code} {r.text[:500]}")
ruleset = r.json()["name"]
print(f"[1/2] ruleset creado: {ruleset}")

# 2. Apuntar el release cloud.firestore al nuevo ruleset
release = f"projects/{PROJECT}/releases/cloud.firestore"
r = requests.patch(
    f"https://firebaserules.googleapis.com/v1/{release}",
    headers=H, timeout=30,
    data=json.dumps({"release": {"name": release, "rulesetName": ruleset}}))
if r.status_code != 200:
    sys.exit(f"[ERROR] publicando release: {r.status_code} {r.text[:500]}")
print("[2/2] reglas publicadas OK")
